import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/tools/island-planner-v2/volume.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replaceAll('export ', ''), context);
const { filterSalesVolume, normalizeSalesVolume } = context;
const candidates = [
    { item: 'elite-greywolf', volume: 3 },
    { item: 'cow', volume: 100 },
    { item: 'pumpkin', volume: 1200 },
    { item: 'unknown', volume: null },
    { item: 'invalid', volume: NaN },
    { item: 'zero-sales', volume: 0 }
];
const result = filterSalesVolume(candidates, 100, candidate => candidate.volume);
assert.deepEqual(Array.from(result.candidates, candidate => candidate.item), ['cow', 'pumpkin']);
assert.equal(result.low, 2);
assert.equal(result.unknown, 2);
assert.equal(filterSalesVolume(candidates, 0, () => { throw new Error('Disabled filter must not need history'); }).candidates.length, candidates.length);
assert.equal(filterSalesVolume(candidates, 2000, candidate => candidate.volume).candidates.length, 0);
assert.equal(normalizeSalesVolume(-10), 0);
assert.equal(normalizeSalesVolume(100.6), 101);
assert.equal(normalizeSalesVolume(50000), 10000);
assert.equal(normalizeSalesVolume(undefined), 100);

const model = readFileSync(new URL('../js/tools/island-planner-v2/model.js', import.meta.url), 'utf8');
context.itemForSlot = () => null;
context.productionModeFor = () => null;
vm.runInContext(model.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', ''), context);
const base = { seedSide: 'buy', harvestSide: 'sell' };
assert.equal(context.normalizeDraft({}, 'Martlock', base).minSalesVolume, 100);
assert.equal(context.normalizeDraft({ minSalesVolume: 0 }, 'Martlock', base).minSalesVolume, 0);
assert.equal(context.normalizeDraft({ minSalesVolume: 250 }, 'Martlock', base).minSalesVolume, 250);
console.log('Island V2 sales volume: threshold, missing history, disabled filter, normalization and saved plans passed.');
