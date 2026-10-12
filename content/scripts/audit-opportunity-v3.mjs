import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, createReadStream, unlinkSync } from 'node:fs';
import { gunzipSync, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';
import { marketSeriesKey } from '../js/core/market-primitives.mjs';
import { writeAuditJson } from './market-audit-artifacts.mjs';

const root = 'docs/opportunity-v3', dir = 'docs/market-spread-review/snapshot';
const read = name => JSON.parse(gunzipSync(readFileSync(`${dir}/${name}.gz`)));
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`));
const now = Date.parse(manifest.asOf);
const servers = JSON.parse(readFileSync('data/price-servers.json')).map(row => row.code);
// Frozen snapshot only. Do not invoke the disk-backed constructor or write its journal.
let archive = read('.aodp-quote-history.json');
const repository = Object.create(QuoteHistoryRepository.prototype);
Object.assign(repository, { history: new OrderPriceHistory({ servers, source: 'aodp-current', policy: AODP_HISTORY_POLICY }),
    anchors: new Map(archive.anchors), current: new Map(archive.current), audits: [], sequence: archive.sequence, pending: [], policy: {} });
repository.history.restore(archive.history, now); archive = null;
for await (const line of createInterface({ input: createReadStream(`${dir}/.aodp-quote-history.json.journal.gz`).pipe(createGunzip()), crlfDelay: Infinity })) {
    if (!line) continue;
    const tx = JSON.parse(line);
    if (tx.sequence <= repository.sequence) continue;
    assert.equal(tx.sequence, repository.sequence + 1);
    for (const event of tx.events) repository.apply(event, now);
    repository.sequence = tx.sequence;
}
repository.prune(now);
const packetHistory = new OrderPriceHistory({ servers }); packetHistory.restore(read('.price-order-history.json'), now);
const rates = JSON.parse(readFileSync('data/economy-constants.json'));
const rate = key => Number(rates.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const captured = { 'market-opportunity-scan.mjs': 'scan', 'market-opportunities.mjs': 'opportunities',
    'market-opportunity-quality.mjs': 'quality', 'market-observation.mjs': 'observation', 'market-opportunity-review.mjs': 'review' };
const baselinePaths = Object.values(captured).map(name => resolve(`${root}/baseline-${name}.mjs`));
for (const name of Object.values(captured)) {
    const source = readFileSync(`${root}/baseline-${name}.txt`, 'utf8').replace(/from '(\.\/[^']+)'/g,
        (_, path) => `from '${pathToFileURL(captured[path.slice(2)] ? resolve(`${root}/baseline-${captured[path.slice(2)]}.mjs`) : resolve('content/js/core', path)).href}'`);
    writeFileSync(resolve(`${root}/baseline-${name}.mjs`), source);
}
let baseline;
try { baseline = await import(pathToFileURL(resolve(`${root}/baseline-scan.mjs`)).href); }
finally { for (const path of baselinePaths) unlinkSync(path); }
const measure = fn => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };
const args = { server: 'europe', repository, packetHistory, now, fees, includeCandidates: true, includeEvaluation: true };
const before = measure(() => baseline.scanQuoteBooks(args));
const after = measure(() => scanQuoteBooks(args));
const warm = measure(() => scanQuoteBooks(args));
assert.deepEqual(after.value.eligibleCandidates, warm.value.eligibleCandidates);
const sideFacts = snapshots => snapshots.map(row => ({ ...row, buy: withoutState(row.buy), sell: withoutState(row.sell) }));
function withoutState({ referenceState, referenceCoverage, ...side }) { return side; }
assert.deepEqual(sideFacts(after.value.evaluation.snapshots), sideFacts(before.value.evaluation.snapshots), 'V3 result policy does not alter archive/reference/side validation');
assert.equal(after.value.scanned, Object.values(after.value.resultCounts).reduce((sum, value) => sum + value, 0));
assert.equal(after.value.scanned, Object.values(after.value.pipeline.reasons).reduce((sum, value) => sum + value, 0));
assert.equal(after.value.counts.verified, after.value.resultCounts.trade);
assert.equal(after.value.counts.potential, after.value.resultCounts.watch);
assert.equal(after.value.scanned, after.value.counts.verified + after.value.counts.monitored + after.value.counts.suspicious + after.value.counts.insufficient);
assert.equal(after.value.pipeline.discovered, after.value.pipeline.validated + after.value.pipeline.watch + after.value.pipeline.discoveredRejected);
const describe = row => ({ id: row.id, itemId: row.itemId, city: row.city, quality: row.quality,
    stage: row.stage, reason: row.resultReason, primary: row.primary?.id, toCity: row.primary?.toCity,
    advantage: row.primary?.advantageSilver, reviews: row.resultReviews, spread: row.spreadReview,
    buy: row.buy, sell: row.sell });
const afterIds = new Set(after.value.eligibleCandidates.map(row => row.id));
const declined = before.value.eligibleCandidates.filter(row => !afterIds.has(row.id)).map(row => ({ before: describe(row),
    after: describe(after.value.evaluation.rows.find(next => next.id === row.id)) }));
const count = (rows, fn) => rows.reduce((counts, row) => { const key = fn(row); counts[key] = (counts[key] || 0) + 1; return counts; }, {});

// Representative real series, prefix replay: evaluate at each original source event.
// Future receipts and future source prices cannot enter a prefix repository.
const strata = new Map();
for (const identity of [...repository.identities(now)].sort((a, b) => marketSeriesKey(a).localeCompare(marketSeriesKey(b)))) {
    if (repository.seriesFor(identity, now).buckets.length < 12) continue;
    const key = `${identity.city}|${identity.side}|${identity.itemId.match(/^T\d/)?.[0]}|${identity.quality}`;
    if (!strata.has(key)) strata.set(key, identity);
}
const picks = [...strata.values()].slice(0, 12);
const replay = [];
const availableAt = point => Math.max(Date.parse(point.sourceQuoteAt ?? point.observedAt),
    Date.parse(point.fetchedAt ?? point.receivedAt ?? point.seenAt));
for (const identity of picks) {
    const series = repository.seriesFor(identity, now);
    const events = series.buckets.flatMap(point => [point, ...(point.evidenceObservations || [])])
        .filter(point => Number.isFinite(availableAt(point)))
        .sort((a, b) => availableAt(a) - availableAt(b));
    const timeline = [];
    for (const event of events) {
        const at = availableAt(event);
        if (!Number.isFinite(at) || at > now) continue;
        const prefix = events.filter(point => Date.parse(point.sourceQuoteAt ?? point.observedAt) <= at
            && Date.parse(point.fetchedAt ?? point.receivedAt ?? point.seenAt) <= at);
        const source = { identities: () => [identity], seriesFor: () => ({ source: series.source, buckets: prefix }) };
        const old = baseline.scanQuoteBooks({ server: 'europe', repository: source, now: at, fees });
        const next = scanQuoteBooks({ server: 'europe', repository: source, now: at, fees });
        timeline.push({ at: new Date(at).toISOString(), events: prefix.length, before: old.counts.verified, after: next.counts.verified, pipeline: next.pipeline });
    }
    assert.ok(timeline.every((entry, index) => !index || entry.at >= timeline[index - 1].at), 'replay follows when evidence became available');
    replay.push({ identity, timeline });
}
const report = { manifest, sequence: repository.sequence,
    baseline: { evaluated: before.value.scanned, discovered: before.value.candidateCount, verified: before.value.counts.verified,
        watch: before.value.counts.potential, primary: count(before.value.eligibleCandidates, row => row.primary.id), ms: before.ms },
    next: { pipeline: after.value.pipeline, resultCounts: after.value.resultCounts,
        primary: count(after.value.eligibleCandidates, row => row.primary.id), coldMs: after.ms, warmMs: warm.ms },
    referenceStates: count(after.value.evaluation.snapshots.flatMap(row => [row.buy, row.sell]).filter(side => side.price > 0), side => side.referenceState),
    unchangedReferences: true, knownRealizedProfit: null, falsePositiveRate: null, missedKnownProfitableTrades: null,
    stages: after.value.evaluation.stages, decisionAudit: after.value.decisionAudit,
    reviewDiagnostics: after.value.evaluation.rows.filter(row => row.resultReviews?.length)
        .map(row => ({ id: row.id, stage: row.stage, reason: row.resultReason, reviews: row.resultReviews })),
    declined, trades: after.value.eligibleCandidates.map(describe), watch: after.value.potentialCandidates.map(describe), replay };
writeAuditJson(`${root}/comparison.json`, report, { compressed: true });
const summary = { baseline: report.baseline, next: report.next, referenceStates: report.referenceStates,
    removedCells: declined.length, prefixSeries: replay.length };
writeAuditJson(`${root}/summary.json`, summary);
console.log(JSON.stringify(summary, null, 2));
