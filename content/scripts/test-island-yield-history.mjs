import assert from 'node:assert/strict';
import { yieldHistory, yieldHistoryKey, yieldHistoryExtent } from '../js/core/island-yield-history.mjs';

const row = (id, date, planted, harvested, returned, extra = {}) => ({
    id, date, seedsPlanted: planted, plantsHarvested: harvested, seedsReturned: returned,
    islandCity: 'Brecilien', plantKey: 'turnip', premium: true, water: false, ...extra
});
const rows = [row(2, '2026-10-02', 27, 270, 18), row(1, '2026-10-01', 9, 72, 9),
    row(3, '2026-10-03', 9, 999, 99, { isOutlier: true }),
    row(4, '2026-10-04', 9, 9, 0, { water: true })];
const history = yieldHistory(rows);
assert.equal(history.snapshots.get('1').avgPlantYield, 8);
assert.equal(history.snapshots.get('2').avgPlantYield, 9.5);
assert.equal(history.snapshots.get('2').avgSeedReturn, .75);
assert.equal(history.snapshots.get('3').avgPlantYield, 9.5);
assert.equal(history.snapshots.get('3').n, 2);
assert.equal(history.snapshots.get('4').avgPlantYield, 1);
assert.equal(history.groups.get(yieldHistoryKey(rows[0])).points.length, 3);
assert.equal(yieldHistory(rows.filter(entry => entry.id !== 1)).snapshots.get('2').avgPlantYield, 10);
assert.equal(yieldHistory(rows.map(entry => entry.id === 1 ? { ...entry, plantsHarvested: 36 } : entry)).snapshots.get('2').avgPlantYield, 8.5);
assert.equal(yieldHistory([row(1, '2026-10-01', 0, 10, 10)]).snapshots.get('1').avgPlantYield, null);
assert.deepEqual(rows.map(entry => entry.id), [2, 1, 3, 4]);
console.log('PASS cumulative weighted history, conditions, outliers, edits, deletion and invalid input');

const acrossMonths = [row(1, '2026-09-30', 90, 450, 45), row(2, '2026-10-01', 9, 90, 9), row(3, '2026-10-02', 27, 243, 18)];
const october = yieldHistory(acrossMonths.filter(entry => entry.date.startsWith('2026-10')));
assert.equal(october.snapshots.get('2').avgPlantYield, 10);
assert.equal(october.snapshots.get('3').avgPlantYield, 9.25);
assert.equal(october.snapshots.get('3').avgSeedReturn, .75);
assert.equal(october.snapshots.get('3').n, 2);
assert.notEqual(yieldHistory(acrossMonths).snapshots.get('3').avgPlantYield, 9.25);
const extent = yieldHistoryExtent([9.47, 9.48]);
assert.ok(extent.high - extent.low > .5, 'small fluctuations must not span the entire chart');
assert.ok(yieldHistoryExtent([0]).high > 0);
console.log('PASS selected period excludes preceding months and chart scale preserves small fluctuations');
