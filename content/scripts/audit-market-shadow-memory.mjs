import assert from 'node:assert/strict';
import { readFileSync, createReadStream, writeFileSync } from 'node:fs';
import { gunzipSync, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';
import { shadowEvaluate } from '../js/core/market-opportunity-shadow.mjs';
import { ANOMALY_STRATEGY } from '../js/core/opportunity-status.mjs';
import { OBSERVATION_POLICY } from '../js/core/market-observation.mjs';

function previousShadowEvaluate({ validatedScan, ...options }) {
    const legacy = scanQuoteBooks({ ...options, includeEvaluation: true, policy: { ...OPPORTUNITY_POLICY, validationMode: 'legacy' } });
    const validated = validatedScan || scanQuoteBooks({ ...options, includeEvaluation: true, policy: OPPORTUNITY_POLICY });
    const oldRows = new Map(legacy.evaluation.rows.map(row => [row.id, row]));
    const nextRows = new Map(validated.evaluation.rows.map(row => [row.id, row]));
    const snapshotKey = row => `${row.itemId}|${row.city}|${row.quality}`;
    const oldSnapshots = new Map(legacy.evaluation.snapshots.map(row => [snapshotKey(row), row]));
    const newSnapshots = new Map(validated.evaluation.snapshots.map(row => [snapshotKey(row), row]));
    const changes = [...new Set([...oldSnapshots.keys(), ...newSnapshots.keys()])].map(id => {
        const before = oldSnapshots.get(id), after = newSnapshots.get(id);
        const beforeRow = oldRows.get(id), afterRow = nextRows.get(id);
        return { id, before: Boolean(beforeRow), after: Boolean(afterRow?.eligible),
            referenceChanges: ['buy', 'sell'].map(side => ({ side, from: before?.[side]?.reference ?? null, to: after?.[side]?.reference ?? null }))
                .filter(change => change.from !== change.to).map(change => ({ ...change,
                    delta: change.from !== null && change.to !== null ? change.to - change.from : null,
                    relativeDelta: change.from > 0 && change.to !== null ? (change.to - change.from) / change.from : null })),
            reasons: [...new Set([afterRow?.validationStatus, ...[after?.buy, after?.sell].flatMap(side => side?.validationReasons || [])].filter(Boolean))] };
    });
    const typeCounts = rows => rows.reduce((counts, row) => {
        const id = row.primary?.id || ANOMALY_STRATEGY[row.anomalies?.[0]] || row.pattern;
        counts[id] = (counts[id] || 0) + 1; return counts;
    }, {});
    return { version: 1, scannedAt: validated.scannedAt, elapsedMs: legacy.elapsedMs + validated.elapsedMs,
        evaluated: validated.scanned, oldCandidates: legacy.candidateCount, newCandidates: validated.candidateCount,
        verified: validated.counts.verified, quarantinedCells: validated.counts.suspicious,
        changedReferences: changes.reduce((total, change) => total + change.referenceChanges.length, 0),
        changedReferenceCells: changes.filter(change => change.referenceChanges.length).length,
        removed: changes.filter(change => change.before && !change.after).length,
        added: changes.filter(change => !change.before && change.after).length,
        types: { legacy: typeCounts(legacy.evaluation.rows), validated: typeCounts(validated.evaluation.rows.filter(row => row.eligible)),
            monitored: typeCounts(validated.evaluation.rows.filter(row => !row.eligible && row.anomalies.length)) },
        top20: { legacy: legacy.opportunities.slice(0, 20).map(row => row.id), validated: validated.opportunities.slice(0, 20).map(row => row.id) },
        affected: changes.filter(change => change.before !== change.after || change.referenceChanges.length)
            .sort((a, b) => Number(b.before && !b.after) - Number(a.before && !a.after)
                || Math.max(0, ...b.referenceChanges.map(change => Math.abs(change.relativeDelta ?? 0)))
                    - Math.max(0, ...a.referenceChanges.map(change => Math.abs(change.relativeDelta ?? 0)))
                || a.id.localeCompare(b.id)).slice(0, OBSERVATION_POLICY.shadowLimit),
        quarantinedObservations: validated.evaluation.snapshots.reduce((total, snapshot) => total
            + [snapshot.buy, snapshot.sell].reduce((n, side) => n + (side.quarantinedObservations || 0), 0), 0),
        referenceLevels: validated.evaluation.snapshots.reduce((counts, snapshot) => {
            for (const side of [snapshot.buy, snapshot.sell]) { const level = side.referenceLevel ?? 0; counts[level] = (counts[level] || 0) + 1; }
            return counts;
        }, {}), truthLabels: false, falseNegatives: null, limited: legacy.truncated || validated.truncated,
        validated: { ...validated, evaluation: undefined } };
}

const root = 'docs/market-spread-review', dir = `${root}/snapshot`;
const read = name => JSON.parse(gunzipSync(readFileSync(`${dir}/${name}.gz`)));
let archive = read('.aodp-quote-history.json');
const now = Date.parse(JSON.parse(readFileSync(`${dir}/manifest.json`)).asOf);
const servers = JSON.parse(readFileSync('data/price-servers.json')).map(row => row.code);
const repository = Object.create(QuoteHistoryRepository.prototype);
Object.assign(repository, { history: new OrderPriceHistory({ servers, source: 'aodp-current', policy: AODP_HISTORY_POLICY }),
    anchors: new Map(archive.anchors), current: new Map(archive.current), audits: [], sequence: archive.sequence, pending: [], policy: {} });
repository.history.restore(archive.history, now); archive = null;
for await (const line of createInterface({ input: createReadStream(`${dir}/.aodp-quote-history.json.journal.gz`).pipe(createGunzip()), crlfDelay: Infinity })) {
    if (!line) continue;
    const tx = JSON.parse(line); if (tx.sequence <= repository.sequence) continue;
    assert.equal(tx.sequence, repository.sequence + 1);
    for (const event of tx.events) repository.apply(event, now);
    repository.sequence = tx.sequence;
}
repository.prune(now);
let packets = read('.price-order-history.json');
const packetHistory = new OrderPriceHistory({ servers }); packetHistory.restore(packets, now); packets = null;
const rates = JSON.parse(readFileSync('data/economy-constants.json'));
const rate = key => Number(rates.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const args = { server: 'europe', repository, packetHistory, now, fees, includeCandidates: true };
if (global.gc) global.gc();
const heapBeforeMb = process.memoryUsage().heapUsed / 1048576;
let started = performance.now();
const payload = scanQuoteBooks({ ...args, includeEvaluation: true, policy: OPPORTUNITY_POLICY });
const scanMs = performance.now() - started;
const scanHeapMb = process.memoryUsage().heapUsed / 1048576;
assert.ok(payload.evaluation?.snapshots.length);
started = performance.now();
const baselineMode = process.env.SHADOW_MEMORY_BASELINE === '1';
const shadow = baselineMode
    ? previousShadowEvaluate({ ...args, validatedScan: payload })
    : shadowEvaluate({ ...args, validatedScan: payload });
const shadowMs = performance.now() - started;
if (!baselineMode) assert.equal(Object.hasOwn(payload, 'evaluation'), false);
assert.equal(shadow.evaluated, payload.scanned);
if (global.gc) global.gc();
const heapAfterShadowMb = process.memoryUsage().heapUsed / 1048576;
// quote-service drops any remaining evaluation field after the shadow report is made.
delete payload.evaluation;
if (global.gc) global.gc();
started = performance.now();
const warm = scanQuoteBooks({ ...args, policy: OPPORTUNITY_POLICY });
const warmMs = performance.now() - started;
assert.equal(warm.scanned, payload.scanned);
assert.equal(warm.eligibleCandidates.length, payload.eligibleCandidates.length);
if (global.gc) global.gc();
const heapAfterWarmMb = process.memoryUsage().heapUsed / 1048576;
const report = { mode: baselineMode ? 'before' : 'after', asOf: new Date(now).toISOString(), sequence: repository.sequence, cells: payload.scanned,
    candidates: payload.eligibleCandidates.length, localMake: payload.eligibleCandidates.filter(row => row.strategies.some(strategy => strategy.id === 'local-make')).length,
    shadowRemoved: shadow.removed, shadowAdded: shadow.added, shadowChangedReferences: shadow.changedReferences,
    scanMs, warmMs, shadowMs, heapMb: { before: heapBeforeMb, afterValidatedScan: scanHeapMb,
        afterShadowGc: heapAfterShadowMb, afterWarmGc: heapAfterWarmMb } };
writeFileSync(`${root}/shadow-memory-${baselineMode ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
const { validated: ignoredValidatedPayload, ...shadowSummary } = shadow;
writeFileSync(`${root}/shadow-summary-${baselineMode ? 'before' : 'after'}.json`, JSON.stringify(shadowSummary, null, 2));
console.log(JSON.stringify(report, null, 2));
