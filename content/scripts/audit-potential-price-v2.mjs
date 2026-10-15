import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { normalizePriceDate, median } from '../js/core/market-primitives.mjs';
import { SALE_HORIZONS, SALE_ESTIMATOR, saleHorizonTarget } from '../js/core/potential-sale-horizon.mjs';
import { saleHorizonTarget as v2 } from './fixtures/potential-sale-horizon-v2.mjs';

const archivePath = 'output/horse-sales-investigation.json';
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const now = Date.parse('2026-10-15T12:00:00Z');
const requestFor = row => ({ server: 'europe', city: row.location, itemId: row.item_id, quality: row.quality, side: 'sell' });
const evidenceFor = rows => ({ source: 'AODP', includeWindowEvidence: true, forecastPoints: rows.map(point => ({ ...point, price: point.avg_price, quantity: point.item_count })) });
const summarize = value => ({ price: value.price, plannerUsable: value.plannerUsable ?? value.reliable,
    candidate: value.candidatePrice ?? value.periodPrice, historicalReference: value.historicalPrice,
    recentReference: value.referencePrice ?? value.recentPrice, latest: value.latest, freshness: value.freshness,
    windows: value.historicalWindows, regimeSupport: value.regimeSupport, deviations: value.deviations,
    rejectionReasons: value.rejectionReasons, reason: value.reason, windowEvidence: value.windowEvidence });
const horse = archive.rows.find(row => row.location === 'Martlock' && row.item_id === 'T4_MOUNT_HORSE' && row.quality === 1);
const daily = horse.data.map(point => ({ date: normalizePriceDate(point.timestamp), day: Date.parse(normalizePriceDate(point.timestamp)) / DAY_MS,
    price: point.avg_price, quantity: point.item_count }));
const provenance = SALE_HORIZONS.map(({ days }) => {
    const old = v2(evidenceFor(horse.data), requestFor(horse), null, days, now), windows = [];
    for (let last = daily.at(-1).day + 1; last - days >= Math.floor(now / DAY_MS) - 90; last -= days) {
        const points = daily.filter(point => point.day >= last - days && point.day < last).sort((a, b) => b.price - a.price);
        if (points.length < 2) continue;
        windows.push({ start: new Date((last - days) * DAY_MS).toISOString(), end: new Date(last * DAY_MS).toISOString(),
            observedDays: points.length, selected: points[1].price, observations: points, supportingTopTwo: points.slice(0, 2) });
    }
    assert.equal(Math.floor(median(windows.map(window => window.selected))), old.price, 'provenance reconstructs exactly the V2 target including silver rounding');
    const sorted = windows.slice().sort((a, b) => a.selected - b.selected);
    return { days, oldV2: summarize(old), medianContributors: sorted.slice(Math.floor((sorted.length - 1) / 2), Math.floor(sorted.length / 2) + 1),
        allWindows: windows, corrected: summarize(saleHorizonTarget(evidenceFor(horse.data), requestFor(horse), null, days, now)) };
});
const realExamples = archive.rows.flatMap(row => SALE_HORIZONS.map(({ days }) => ({ request: requestFor(row), days,
    oldV2: summarize(v2(evidenceFor(row.data), requestFor(row), null, days, now)),
    corrected: summarize(saleHorizonTarget(evidenceFor(row.data), requestFor(row), null, days, now)) })));
const farm = JSON.parse(await readFile('content/scripts/fixtures/island-sales-history-live.json', 'utf8'));
for (const row of farm.rows) for (const { days } of SALE_HORIZONS) {
    const at = Date.parse('2026-10-12T00:00:00Z');
    realExamples.push({ source: 'content/scripts/fixtures/island-sales-history-live.json', asOf: new Date(at).toISOString(), request: requestFor(row), days,
        oldV2: summarize(v2(evidenceFor(row.data), requestFor(row), null, days, at)),
        corrected: summarize(saleHorizonTarget(evidenceFor(row.data), requestFor(row), null, days, at)) });
}
const backtest = [];
for (const row of archive.rows) for (const { days } of SALE_HORIZONS) {
    for (let index = 14; index + days <= row.data.length; index += 7) {
        const at = Date.parse(normalizePriceDate(row.data[index].timestamp)), past = evidenceFor(row.data.slice(0, index));
        const old = v2(past, requestFor(row), null, days, at), next = saleHorizonTarget(past, requestFor(row), null, days, at);
        assert.deepEqual(saleHorizonTarget(evidenceFor(row.data), requestFor(row), null, days, at), next, 'future rows cannot alter forecast or proof');
        const future = row.data.slice(index, index + days).map(point => point.avg_price);
        backtest.push({ city: row.location, days, asOf: new Date(at).toISOString(), trainingDays: index,
            oldV2: old.price, corrected: next.price, reference: next.referencePrice, futureObservedDays: future.length,
            futureAverageMin: Math.min(...future), futureAverageMax: Math.max(...future),
            oldLevelObservedInAverages: old.price == null ? null : future.some(price => price >= old.price),
            correctedLevelObservedInAverages: next.price == null ? null : future.some(price => price >= next.price) });
    }
}
const backtestSummary = SALE_HORIZONS.map(({ days }) => {
    const rows = backtest.filter(row => row.days === days);
    return { days, cuts: rows.length, oldV2Targets: rows.filter(row => row.oldV2 != null).length,
        correctedTargets: rows.filter(row => row.corrected != null).length,
        oldLevelsObservedInAverages: rows.filter(row => row.oldLevelObservedInAverages === true).length,
        correctedLevelsObservedInAverages: rows.filter(row => row.correctedLevelObservedInAverages === true).length };
});
const result = { estimator: SALE_ESTIMATOR, source: archivePath, archivedAt: archive.rows[0].fetchedAt,
    asOf: new Date(now).toISOString(), horseDailyObservations: daily, horseProvenance: provenance, realExamples, backtestSummary, backtest,
    limitations: ['Daily averages and item quantities are not individual executions or order fills.',
        'Historical cuts exclude all future rows and incomplete intervals; availability of later archive revisions at the original date is unknown.',
        'No 28-day success claim: 90 days cannot contain three independent 28-day training windows plus 28 future days.',
        'Acceptance thresholds are explicit conservative evidence policy, not calibrated probabilities.'] };
await writeFile('output/potential-price-v2-review.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ horse: provenance.map(value => ({ days: value.days, old: value.oldV2.price, corrected: value.corrected.price,
    reference: value.corrected.recentReference, planner: value.corrected.plannerUsable })), backtestSummary }, null, 2));
