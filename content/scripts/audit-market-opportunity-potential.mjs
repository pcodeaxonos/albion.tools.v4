import { readFileSync, createReadStream, writeFileSync } from 'node:fs';
import { gunzipSync, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';

const root = 'docs/market-spread-review', dir = `${root}/snapshot`;
const read = name => JSON.parse(gunzipSync(readFileSync(`${dir}/${name}.gz`)));
let archive = read('.aodp-quote-history.json');
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`));
const now = Date.parse(manifest.asOf);
const servers = JSON.parse(readFileSync('data/price-servers.json')).map(row => row.code);
const repository = Object.create(QuoteHistoryRepository.prototype);
Object.assign(repository, { history: new OrderPriceHistory({ servers, source: 'aodp-current', policy: AODP_HISTORY_POLICY }),
    anchors: new Map(archive.anchors), current: new Map(archive.current), audits: [], sequence: archive.sequence, pending: [], policy: {} });
repository.history.restore(archive.history, now); archive = null;
for await (const line of createInterface({ input: createReadStream(`${dir}/.aodp-quote-history.json.journal.gz`).pipe(createGunzip()), crlfDelay: Infinity })) {
    if (!line) continue;
    const tx = JSON.parse(line);
    if (tx.sequence <= repository.sequence) continue;
    if (tx.sequence !== repository.sequence + 1) throw new Error(`Journal gap at sequence ${repository.sequence + 1}`);
    for (const event of tx.events) repository.apply(event, now);
    repository.sequence = tx.sequence;
}
repository.prune(now);
let packetData = read('.price-order-history.json');
const packetHistory = new OrderPriceHistory({ servers }); packetHistory.restore(packetData, now); packetData = null;
const rates = JSON.parse(readFileSync('data/economy-constants.json'));
const rate = key => Number(rates.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const args = { server: 'europe', repository, packetHistory, now, fees, includeCandidates: true };
if (global.gc) global.gc();
const coldStart = performance.now();
const scan = scanQuoteBooks({ ...args, includeEvaluation: true, policy: OPPORTUNITY_POLICY });
const coldMs = performance.now() - coldStart;
const heapAfterColdMb = process.memoryUsage().heapUsed / 1048576;
const warmStart = performance.now();
const warm = scanQuoteBooks(args);
const warmMs = performance.now() - warmStart;
if (warm.scanned !== scan.scanned || warm.counts.verified !== scan.counts.verified || warm.counts.potential !== scan.counts.potential) {
    throw new Error('Cold/warm scan decisions diverged');
}
const reasonEntries = Object.entries(scan.decisionAudit || {});
const strategyRejections = Object.fromEntries(reasonEntries.map(([strategy, value]) => [strategy, value]));
const top20 = (scan.potentialCandidates || []).slice(0, 20).map(row => {
    const strategy = row.primary;
    const sides = Object.fromEntries(Object.entries(strategy.evidence?.inputs || {}).map(([key, side]) => [key, side && ({
        price: side.price, at: side.at, ageMs: side.ageMs, source: side.source, sourceTimeKnown: side.sourceTimeKnown,
        coverage: side.coverage, status: side.validationStatus, reference: side.reference, referenceLevel: side.referenceLevel,
        deviation: side.deviation, referenceSamples: side.referenceSamples, referenceSpanMs: side.referenceSpanMs,
        validationReasons: side.validationReasons || []
    })]));
    return { id: row.id, itemId: row.itemId, city: row.city, quality: row.quality, strategy: strategy.id,
        advantageSilver: strategy.advantageSilver, returnRatio: strategy.economics?.returnRatio ?? null,
        evidenceReasons: strategy.evidence?.reasons || [], explanation: strategy.note, sides };
});
const report = {
    snapshot: { asOf: manifest.asOf, sequence: repository.sequence, cells: scan.scanned },
    counts: scan.counts,
    priorSpreadReview: { localMake: 867, note: 'sequence 2539 prior audit; remains outside main opportunities list' },
    rejectionReasonTotals: scan.rejectionReasons,
    strategyRejections,
    potentialStrategyTypes: (scan.potentialCandidates || []).reduce((counts, row) => {
        counts[row.primary.id] = (counts[row.primary.id] || 0) + 1; return counts;
    }, {}),
    first20: top20,
    performance: { coldMs, warmMs, heapAfterColdMb },
    decisionFieldsChangedByClassification: false
};
writeFileSync(`${root}/potential-review.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ snapshot: report.snapshot, counts: report.counts,
    rejectionReasonTotals: report.rejectionReasonTotals, potentialStrategyTypes: report.potentialStrategyTypes,
    coldMs, warmMs, heapAfterColdMb, top20: top20.map(row => ({ id: row.id, strategy: row.strategy, advantageSilver: row.advantageSilver, reasons: row.evidenceReasons })) }, null, 2));
