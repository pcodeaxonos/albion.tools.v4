import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { saleHorizonTarget, mergePotentialHistory, SALE_HORIZONS, SALE_ESTIMATOR } from '../js/core/potential-sale-horizon.mjs';
import { saleHorizonTarget as oldTarget } from './fixtures/potential-sale-horizon-v1.mjs';
import { saleHorizonTarget as oldV2Target } from './fixtures/potential-sale-horizon-v2.mjs';
import { savePotentialSnapshots, readPotentialSnapshots, potentialPriceDecision } from '../js/core/potential-price-snapshot.mjs';
import { tradeEvidenceKey, potentialPriceAt } from '../js/core/trade-potential-evidence.mjs';
const now = Date.parse('2026-10-15T12:00:00Z'), end = Math.floor(now / DAY_MS) * DAY_MS;
const request = { server: 'europe', city: 'Martlock', itemId: 'T4_MOUNT_HORSE', quality: 1, side: 'sell' };
const series = prices => ({ forecastPoints: prices.map((price, i) => ({ timestamp: new Date(end - (i + 1) * DAY_MS).toISOString(), price, quantity: 20 })) });
const flat = series(Array(90).fill(100));
assert.equal(saleHorizonTarget(flat, request, null, 2, now).windowEvidence, undefined, 'normal snapshots do not replicate full daily archives');
assert(saleHorizonTarget({ ...flat, includeWindowEvidence: true }, request, null, 2, now).windowEvidence.length > 0, 'audits can inspect each independent window');
const order = { item_id: request.itemId, city: request.city, quality: 1, sell_price_min: 81, sell_price_min_date: new Date(now).toISOString() };
assert.equal(saleHorizonTarget(flat, request, order, 7, now).price, 100);
assert.equal(saleHorizonTarget(series([10000, ...Array(89).fill(100)]), request, null, 28, now).price, 100);
assert.equal(saleHorizonTarget(series([1, ...Array(89).fill(100)]), { ...request, side: 'buy' }, null, 28, now).price, 100);
const delayed = { forecastPoints: flat.forecastPoints.slice(3) };
assert.equal(saleHorizonTarget(delayed, request, null, 28, now).freshness, 'delayed');
assert.equal(saleHorizonTarget(delayed, request, null, 28, now).price, 100);
const stale = saleHorizonTarget({ forecastPoints: flat.forecastPoints.slice(8) }, request, null, 28, now);
assert.equal(stale.price, null); assert.equal(stale.indicativePrice, 100);
assert.equal(saleHorizonTarget(series([100, 100]), request, null, 28, now).historicalPrice, 100);
assert.equal(saleHorizonTarget(series([100, 100]), request, null, 28, now).price, null);
assert.equal(saleHorizonTarget(series([]), request, order, 28, now).indicativePrice, null);
assert.equal(saleHorizonTarget({ forecastPoints: [{ timestamp: new Date(now + DAY_MS).toISOString(), price: 100, quantity: 20 }] }, request, order, 28, now).price, null);
for (const days of [0, -1, 14, NaN]) assert.equal(saleHorizonTarget(flat, request, order, days, now).price, null);
const sparseWindows = { forecastPoints: flat.forecastPoints.filter((_, i) => [0, 1, 28, 29, 56, 57].includes(i)) };
assert.equal(oldV2Target(sparseWindows, request, null, 28, now).price, 100, 'baseline admitted just two days per month');
assert.equal(saleHorizonTarget(sparseWindows, request, null, 28, now).price, null);
assert.equal(saleHorizonTarget(sparseWindows, request, null, 28, now).referencePrice, 100);
const partialDays = { forecastPoints: flat.forecastPoints.map(point => ({ ...point, intervalHours: 1 })) };
assert.equal(saleHorizonTarget(partialDays, request, null, 28, now).price, null, 'one observed hour is not a fully covered day');
const monthlyPeaks = series(Array.from({ length: 90 }, (_, i) => i % 28 < 2 ? 150 : 100));
assert.equal(oldV2Target(monthlyPeaks, request, null, 28, now).price, 150);
assert.equal(saleHorizonTarget(monthlyPeaks, request, null, 28, now).price, 100, 'two monthly peaks cannot set a monthly target');
const tinyPeaks = series(Array.from({ length: 90 }, (_, i) => i % 7 < 2 ? 120 : 100));
tinyPeaks.forecastPoints = tinyPeaks.forecastPoints.map(point => ({ ...point, quantity: point.price === 120 ? 1 : 1000 }));
assert.equal(saleHorizonTarget(tinyPeaks, request, null, 7, now).price, null, 'a few units cannot establish an advantageous target');
const distantOrder = { ...order, sell_price_min: 51 };
const defended = saleHorizonTarget(flat, request, distantOrder, 7, now);
assert.equal(defended.reviewRequired, true); assert.equal(defended.price, 100, 'strong repeated history can defend a large live-book deviation');
const atCutoff = Date.parse('2026-09-20T00:00:00Z');
assert.equal(saleHorizonTarget({ forecastPoints: [{ timestamp: '2026-09-19T23:00:00Z', price: 100, quantity: 20, intervalHours: 6 }] }, request, null, 7, atCutoff).samples, 0, 'a bucket straddling the forecast cutoff is not historical evidence');
const varied = series(Array.from({ length: 90 }, (_, i) => [80, 90, 100, 110, 120, 130, 140][i % 7]));
const horizons = SALE_HORIZONS.map(({ days }) => saleHorizonTarget(varied, request, null, days, now).price);
assert(new Set(horizons).size > 1);
const timestamp = '2026-10-10T00:00:00Z';
const merged = mergePotentialHistory([{ source: 'daily', points: [{ timestamp, avg_price: 100, item_count: 1000 }] },
    { source: 'partial', points: [{ timestamp, avg_price: 10000, item_count: 1, intervalHours: 1 }] }]);
assert.equal(merged.length, 1); assert.equal(merged[0].price, 100);
assert.deepEqual(mergePotentialHistory([{ source: 'a', points: merged }, { source: 'b', points: merged }]), merged);
const overlapping = mergePotentialHistory([{ source: 'packet', points: [
    { timestamp, avg_price: 100, item_count: 60, intervalHours: 6 },
    { timestamp: '2026-10-10T01:00:00Z', avg_price: 999, item_count: 10, intervalHours: 1 }
] }]);
assert.equal(overlapping.length, 1, 'an hourly interval is not added to its six-hour parent');
assert.equal(overlapping[0].quantity, 60);
const personalForecastPoints = Array.from({ length: 90 }, (_, day) => [80, 100, 120].map((price, n) => ({
    timestamp: new Date(end - (day + 1) * DAY_MS).toISOString(), price, quantity: 10, sourceId: `${day}-${n}`, source: 'Kişisel' }))).flat();
const personalTarget = saleHorizonTarget({ ...flat, personalForecastPoints }, request, null, 7, now);
assert.equal(personalTarget.price, 120); assert.equal(personalTarget.marketEvidence.price, 100);
assert.equal(personalTarget.personalEvidence.transactions, 270);
assert.equal(saleHorizonTarget({ ...flat, personalForecastPoints: [...personalForecastPoints, ...personalForecastPoints] }, request, null, 7, now).personalEvidence.transactions, 270);
assert.equal(saleHorizonTarget({ ...flat, personalForecastPoints }, { ...request, side: 'buy' }, null, 7, now).price, 80);
const conflictingPersonal = personalForecastPoints.map(point => ({ ...point, price: point.price * 10 }));
const conflictingTarget = saleHorizonTarget({ ...flat, personalForecastPoints: conflictingPersonal }, request, null, 7, now);
assert.equal(conflictingTarget.price, 100, 'personal history cannot bypass a large uncorroborated market-regime deviation');
assert.equal(conflictingTarget.personalEvidence.marketRegimeConflict, true);
const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
const target = saleHorizonTarget(delayed, request, null, 28, now);
savePotentialSnapshots(storage, [request], 28, new Map([[tradeEvidenceKey(request), target]]), now);
assert.equal(readPotentialSnapshots(storage, [request], 28, now).size, 1);
assert.equal(potentialPriceDecision({ ...target, savedSnapshot: true }, request, 28, now).decision, 'Uyarıyla kullanılabilir');
assert.equal(potentialPriceAt(readPotentialSnapshots(storage, [request], 28, now), request, 28, now + 4 * DAY_MS).price, null);
savePotentialSnapshots(storage, [request], 28, new Map([[tradeEvidenceKey(request), { ...target, estimator: 'old' }]]), now);
assert.equal(readPotentialSnapshots(storage, [request], 28, now).size, 0);
const archive = JSON.parse(await readFile('output/horse-sales-investigation.json', 'utf8'));
const horse = archive.rows.find(row => row.location === 'Martlock' && row.quality === 1);
assert(horse);
const proof = data => ({ source: 'AODP', forecastPoints: data.map(point => ({ ...point, price: point.avg_price, quantity: point.item_count })) });
const cutoff = horse.data.filter(point => Date.parse(point.timestamp + (point.timestamp.endsWith('Z') ? '' : 'Z')) < Date.parse('2026-10-12T00:00:00Z'));
const comparison = SALE_HORIZONS.map(({ days }) => {
    const next = saleHorizonTarget(proof(cutoff), request, null, days, now);
    return { days, old: oldTarget(proof(cutoff), request, null, days, now).price,
        oldV2: oldV2Target(proof(cutoff), request, null, days, now).price,
        new: next.price, reference: next.referencePrice, candidate: next.candidatePrice, plannerUsable: next.plannerUsable };
});
assert.equal(cutoff.length, 87);
assert.deepEqual(comparison.map(value => value.oldV2), [38036, 39317, 42865]);
assert(comparison.every(value => value.new === null && value.reference === 27143 && !value.plannerUsable), 'old-regime horse targets are reference-only');
const backtest = [];
for (let index = 35; index < horse.data.length - 28; index += 7) {
    const at = Date.parse(horse.data[index].timestamp + 'Z');
    const past = proof(horse.data.slice(0, index));
    for (const { days } of SALE_HORIZONS) {
        const future = horse.data.slice(index, index + days).map(point => point.avg_price);
        const old = oldTarget(past, request, null, days, at), oldV2 = oldV2Target(past, request, null, days, at), next = saleHorizonTarget(past, request, null, days, at);
        assert.deepEqual(saleHorizonTarget(proof(horse.data), request, null, days, at), next, 'future observations cannot alter the past forecast or its proof');
        backtest.push({ at: new Date(at).toISOString(), days, old: old.price, oldV2: oldV2.price, new: next.price,
            futureAverageMin: Math.min(...future), futureAverageMax: Math.max(...future),
            coveredDays: future.length, oldLevelObservedInDailyAverages: old.price != null && future.some(price => price >= old.price),
            newLevelObservedInDailyAverages: next.price != null && future.some(price => price >= next.price) });
    }
}
await writeFile('output/supported-potential-verification.json', JSON.stringify({ estimator: SALE_ESTIMATOR,
    source: 'Existing output/horse-sales-investigation.json; daily averages, not individual executions',
    cutoff: { days: cutoff.length, latest: cutoff.at(-1).timestamp }, comparison, syntheticHorizons: horizons, backtest,
    limitation: 'Subsequent averages describe movement only; fills and realized sale success are unknown.' }, null, 2));
console.log('Supported potential: spikes, sparse/stale/delayed, coverage/dedup, independent horizons, planner admission and real walk-forward checks passed.', comparison);
