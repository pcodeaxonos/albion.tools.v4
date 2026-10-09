import assert from 'node:assert/strict';
import { metricYieldStability, yieldDisplayValues, yieldStability } from '../js/core/island-yield-stability.mjs';

const row = (rate, input = 100) => ({ seedsPlanted: input, plantsHarvested: rate * input, seedsReturned: input });
const evaluate = (rows, display = {}) => metricYieldStability(rows, 'plantsHarvested', display);
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }

test('level 4 survives every realistic next value, including rounded displays', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i % 2 ? 20.321 : 20.319));
    const display = { reference: 19.8 };
    const before = evaluate(rows, display);
    assert.equal(before.level, 4);
    for (let i = 0; i <= 100; i++) {
        const rate = before.testedNextMin + i / 100 * (before.testedNextMax - before.testedNextMin);
        const after = evaluate([...rows, row(rate, before.realisticNextSampleSize)], display);
        assert.deepEqual(yieldDisplayValues(after.currentMean, display), before.currentDisplayedRoundedValue);
        assert.ok(Math.abs(after.currentMean - before.currentMean) <= before.maximumAbsoluteChange + 1e-12);
        assert.ok(before.maximumRelativeChange <= 0.005);
    }
});

test('2% to 3% rounding crossing alone does not prevent level 4', () => {
    const reference = 19.8;
    const rows = Array.from({ length: 50 }, () => row(reference * 1.024999));
    const before = evaluate(rows, { reference });
    assert.equal(before.currentDisplayedRoundedValue.difference, '2');
    assert.ok(before.impactSteps < 0.5, 'underlying mean is already stable');
    assert.ok(before.possibleDisplayedValues.some(value => value.difference === '3'));
    assert.equal(before.level, 4);
    assert.equal(before.deviationDisplayStable, false);
    const after = evaluate([...rows, row(before.testedNextMax, before.realisticNextSampleSize)], { reference });
    assert.equal(after.currentDisplayedRoundedValue.difference, '3');
});

test('low variance stabilizes earlier; high variance needs more data', () => {
    const low = Array.from({ length: 20 }, () => row(10));
    const high = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 11 : 9));
    assert.equal(evaluate(low).level, 4);
    assert.ok(evaluate(high).level < 4);
    const more = Array.from({ length: 2000 }, (_, i) => row(i % 2 ? 11 : 9));
    assert.equal(evaluate(more).level, 4);
});

test('marked outliers are shared exclusions; one unmarked extreme does not inflate the envelope', () => {
    const rows = Array.from({ length: 1000 }, () => row(10));
    const before = evaluate(rows);
    assert.deepEqual(evaluate([...rows, { ...row(10000), isOutlier: true }]), before);
    assert.deepEqual(evaluate([...rows, { ...row(10000), isOutlier: 'true' }]), before);
    const unmarked = evaluate([...rows, row(100, 1)]);
    assert.equal(unmarked.level, before.level);
    assert.equal(unmarked.testedNextMax, before.testedNextMax);
    assert.ok(unmarked.currentMean > before.currentMean, 'actual economic mean is never silently trimmed');
});

test('large next batches have greater weighted impact', () => {
    const small = Array.from({ length: 100 }, (_, i) => row(i % 2 ? 11 : 9, 100));
    const large = small.map((r, i) => i < 30 ? { ...r, seedsPlanted: 1000, plantsHarvested: r.plantsHarvested * 10 } : r);
    assert.ok(evaluate(large).realisticNextSampleSize > evaluate(small).realisticNextSampleSize);
    assert.ok(evaluate(large).maximumAbsoluteChange > evaluate(small).maximumAbsoluteChange);
});

test('repeating the same distribution improves confidence without fixed count thresholds', () => {
    let previous = 0;
    for (const n of [2, 4, 10, 20, 100, 500, 2000]) {
        const result = evaluate(Array.from({ length: n }, (_, i) => row(i % 2 ? 11 : 9)));
        assert.ok(result.level >= previous);
        previous = result.level;
    }
});

test('same-day split rows do not manufacture independent history', () => {
    const first = { ...row(10), date: '2026-10-06' };
    assert.equal(evaluate([first, first]).level, 1);
    const second = { ...row(11), date: '2026-10-07' };
    const original = evaluate([first, second]);
    const split = evaluate([first, { ...second, seedsPlanted: 50, plantsHarvested: 550 }, { ...second, seedsPlanted: 50, plantsHarvested: 550 }]);
    assert.equal(split.recordCount, 3);
    assert.equal(original.recordCount, 2);
    assert.deepEqual({ ...split, recordCount: 0 }, { ...original, recordCount: 0 });
});

test('diagnostics expose all decision inputs and combine the limiting metric', () => {
    const result = yieldStability(Array.from({ length: 20 }, () => row(10)));
    for (const key of ['sampleQuantity', 'currentMean', 'realisticNextSampleSize', 'testedNextMin', 'testedNextMax',
        'worstCaseNewMean', 'maximumAbsoluteChange', 'maximumRelativeChange', 'currentDisplayedRoundedValue', 'possibleDisplayedValues', 'level',
        'totalSampleQuantity', 'recordCount', 'typicalNextSampleSize', 'typicalImpact', 'upperRealisticImpact',
        'displayedValueImpact', 'finalStabilityScore', 'confidenceLevel', 'reason', 'rawImpactSteps', 'rawDisplayStable']) {
        assert.ok(key in result.harvest, key);
    }
    assert.equal(result.level, Math.min(result.harvest.level, result.seedReturn.level));
    assert.equal(JSON.stringify(result), JSON.stringify(yieldStability(Array.from({ length: 20 }, () => row(10)))));
});

test('only absence of valid data is level 0; one valid record is level 1', () => {
    for (const rows of [[], [row(10, 0)], [{ ...row(10), isOutlier: true }],
        [{ seedsPlanted: 100, plantsHarvested: NaN }]]) assert.equal(evaluate(rows).level, 0);
    assert.equal(evaluate([row(10)]).level, 1);
    assert.equal(evaluate([row(0)]).level, 1);
    assert.equal(evaluate([row(10, 1000000)]).level, 1);
    const missingReturn = yieldStability([{ seedsPlanted: 100, plantsHarvested: 1000 }]);
    assert.equal(missingReturn.level, 1);
    assert.equal(missingReturn.reason, 'missing-required-metric-history');
});

test('normal variance advances through 2 and 3 rather than accumulating at 1', () => {
    const data = n => Array.from({ length: n }, (_, i) => row(i % 2 ? 11 : 9));
    assert.equal(evaluate(data(2)).level, 1);
    assert.equal(evaluate(data(10)).level, 2);
    assert.equal(evaluate(data(13)).level, 2);
    assert.equal(evaluate(data(20)).level, 3);
    assert.equal(evaluate(data(2000)).level, 4);
    const before = evaluate(data(20));
    assert.ok(before.upperImpactSteps > 1, 'upper endpoint alone would reject level 3');
    assert.ok(before.typicalImpactSteps <= 0.5);
});

test('tiny rounding changes remain diagnostic without capping confidence', () => {
    const result = evaluate(Array.from({ length: 50 }, () => row(19.8 * 1.024999)), { reference: 19.8 });
    assert.equal(result.level, 4);
    assert.equal(result.reason, 'typical-and-upper-impact-negligible-decision-stable');
    assert.equal(result.displayedValueImpact.percentagePoints, 1);
    assert.ok(result.finalStabilityScore < 0.5);
});

test('greater sample quantity supports stability without count thresholds', () => {
    const data = size => Array.from({ length: 20 }, (_, i) => row(i % 2 ? 10.001 : 9.999, size));
    const small = evaluate(data(1)), large = evaluate(data(100));
    assert.ok(large.totalSampleQuantity > small.totalSampleQuantity);
    assert.ok(large.level >= small.level);
    assert.ok(large.typicalImpact <= small.typicalImpact);
    assert.ok(large.finalStabilityScore <= small.finalStabilityScore);
});

test('successive normal records do not send an established level 3 back to 1', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 11 : 9));
    assert.equal(evaluate(rows).level, 3);
    for (let i = 0; i < 100; i++) {
        rows.push(row(i % 2 ? 11 : 9));
        assert.ok(evaluate(rows).level >= 3);
    }
});

test('typical scenarios preserve size/rate pairing and the tail remains separate', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 11 : 9, i % 2 ? 100 : 10));
    const result = evaluate(rows);
    const expected = rows.reduce((sum, r) => sum + Math.abs(r.plantsHarvested / r.seedsPlanted - result.currentMean)
        * r.seedsPlanted / (result.sampleQuantity + r.seedsPlanted), 0) / rows.length;
    assert.ok(Math.abs(result.typicalImpact - expected) < 1e-12);
    assert.ok(result.upperRealisticImpact >= result.typicalImpact);
    assert.ok(result.realisticNextSampleSize >= result.typicalNextSampleSize);
});

test('one malformed huge batch cannot define the normal next batch size', () => {
    const rows = Array.from({ length: 100 }, () => row(10));
    assert.equal(evaluate([...rows, row(10, 1e9)]).realisticNextSampleSize, evaluate(rows).realisticNextSampleSize);
});

test('rounded quantity, return and raw direction transitions are diagnostic only', () => {
    const rows = Array.from({ length: 100 }, () => row(10.004999));
    const result = evaluate(rows);
    assert.ok(result.impactSteps < 0.5);
    assert.equal(result.level, 4, 'two-decimal quantity rounding does not gate decisions');
    assert.equal(result.rawDisplayStable, false);
    assert.equal(result.displayStable, true);
    const returns = rows.map(r => ({ ...r, seedsReturned: r.seedsPlanted * 1.024999 }));
    const resultReturn = metricYieldStability(returns, 'seedsReturned', { kind: 'percent', reference: 1 });
    assert.ok(resultReturn.possibleDisplayedValues.some(value => value.difference === '3'));
    assert.equal(resultReturn.level, 4);
    assert.equal(resultReturn.returnPercentageDisplayStable, false);
    const crossing = evaluate(Array.from({ length: 100 }, () => row(10)), { reference: 10 });
    assert.equal(crossing.level, 4);
    assert.equal(crossing.directionStable, true);
    assert.equal(crossing.rawDirectionStable, false);
    assert.equal(crossing.currentMaterialDirection, 0);
});

test('near-default sign crossings stay neutral inside the existing material reference band', () => {
    const result = evaluate(Array.from({length:100},(_,i)=>row(9.5001+(i%2 ? 0.5 : -0.5))),{reference:9.5});
    assert.equal(result.level,4);
    assert.equal(result.rawDirectionStable,false);
    assert.equal(result.directionStable,true);
    assert.equal(result.currentMaterialDirection,0);
    assert.ok(result.possibleMaterialDirections.every(value=>value===0));
    assert.equal(result.materialDirectionThreshold,0.005);
});

test('material positive to negative reversals still block level 4 symmetrically', () => {
    for(const mean of [9.6,9.4]) {
        const result=evaluate(Array.from({length:10},(_,i)=>row(mean+(i%2 ? 1 : -1))),{reference:9.5});
        assert.notEqual(result.currentMaterialDirection,0);
        assert.ok(result.possibleMaterialDirections.includes(-result.currentMaterialDirection));
        assert.equal(result.directionStable,false);
        assert.ok(result.level<4);
        assert.ok(result.level4FailedConditions.includes('directionStable'));
    }
});

test('an unchanged integer return display cannot override excessive continuous return impact', () => {
    const rows=Array.from({length:10},(_,i)=>({...row(10,20),seedsReturned:20*(i===9 ? 1.4549 : 0.9549)}));
    const result=metricYieldStability(rows,'seedsReturned',{kind:'percent',reference:1});
    assert.equal(result.returnPercentageDisplayStable,true);
    assert.ok(result.maximumAbsoluteChange*100>0.5);
    assert.equal(result.level4Conditions.upperReturnPercentagePointImpact,false);
    assert.ok(result.level<4);
});

test('10.00 to 10.01 is allowed at level 4 when economic and deviation impacts are small', () => {
    const result = evaluate(Array.from({ length: 100 }, (_, i) => row(i % 2 ? 10.5 : 9.5)), { reference: 9.5 });
    assert.equal(result.currentMean, 10);
    assert.equal(result.level, 4);
    assert.ok(result.maximumAbsoluteChange > 0.005);
    assert.ok(result.possibleDisplayedValues.some(value => value.actual === '10,01'));
    assert.ok(result.possibleDisplayedValues.every(value => value.difference === '5' && value.direction === 1));
    assert.ok(result.maximumRelativeChange < 0.005);
    assert.equal(result.rawDisplayStable, false);
});

test('5% to 6% rounded deviation is allowed when the continuous effect is small', () => {
    const result = evaluate(Array.from({ length: 50 }, (_, i) => row(i % 2 ? 10.5 : 9.5)), { reference: 9.5 });
    assert.ok(result.impactSteps < 0.5, 'unrounded decision impact already passes');
    assert.equal(result.currentDisplayedRoundedValue.difference, '5');
    assert.ok(result.possibleDisplayedValues.some(value => value.difference === '6'));
    assert.equal(result.level, 4);
    assert.ok(result.maximumDeviationPercentagePointChange < 0.5);
});

test('5.49% to above 5.51% is a harmless rounding crossing', () => {
    const result = evaluate(Array.from({ length: 100 }, (_, i) => row(10.549 + (i % 2 ? 0.1 : -0.1))), { reference: 10 });
    assert.equal(result.level, 4);
    assert.ok(Math.abs(result.currentContinuousDeviation - 5.49) < 1e-10);
    assert.ok(result.possibleContinuousDeviations.some(value => value > 5.51));
    assert.equal(result.deviationDisplayStable, false);
    assert.ok(result.maximumDeviationPercentagePointChange < 0.03);
});

test('a real 5.1% to 6.0% deviation movement remains material', () => {
    const result = evaluate(Array.from({ length: 10 }, (_, i) => row(10.51 + (i % 2 ? 0.5 : -0.5))), { reference: 10 });
    assert.ok(Math.abs(result.currentContinuousDeviation - 5.1) < 1e-10);
    assert.ok(result.possibleContinuousDeviations.some(value => value >= 6));
    assert.ok(result.maximumDeviationPercentagePointChange > 0.5);
    assert.ok(result.level < 4);
    assert.ok(result.level4FailedConditions.includes('upperReferenceImpact'));
});

test('continuous reference impact still gates level 4 even if relative yield impact passes', () => {
    const result = evaluate(Array.from({ length: 28 }, (_, i) => row(10.51 + (i % 2 ? 0.5 : -0.5))), { reference: 10 });
    assert.equal(result.level4Conditions.upperRelativeYieldImpact, true);
    assert.equal(result.level4Conditions.typicalImpact, true);
    assert.equal(result.level4Conditions.upperReferenceImpact, false);
    assert.ok(result.maximumDeviationPercentagePointChange > 0.5);
    assert.ok(result.level < 4);
});

test('upper relative economic impact exceeding the unchanged half-percent limit prevents level 4', () => {
    const result = evaluate(Array.from({ length: 20 }, (_, i) => row(i % 2 ? 10.5 : 9.5)));
    assert.ok(result.typicalImpactSteps <= 0.5);
    assert.ok(result.maximumRelativeChange > 0.005);
    assert.ok(result.level < 4);
});

test('scaling all quantities gives no extra confidence bonus when rounding floors are inactive', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 11 : 9));
    const original = evaluate(rows);
    const scaled = evaluate(rows.map(r => ({ ...r, seedsPlanted: r.seedsPlanted * 100,
        plantsHarvested: r.plantsHarvested * 100 })));
    assert.equal(scaled.totalSampleQuantity, original.totalSampleQuantity * 100);
    for (const key of ['typicalImpact', 'upperRealisticImpact', 'typicalImpactSteps', 'upperImpactSteps', 'finalStabilityScore']) {
        assert.ok(Math.abs(scaled[key] - original[key]) < 1e-12, key);
    }
    assert.equal(scaled.level, original.level);
});

test('more history reduces impact exactly once by the analytical leverage ratio', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 11 : 9));
    const original = evaluate(rows);
    const larger = evaluate([...rows, ...rows, ...rows, ...rows]);
    const q = original.realisticNextSampleSize;
    assert.equal(larger.realisticNextSampleSize, q);
    const expectedRatio = (original.sampleQuantity + q) / (larger.sampleQuantity + q);
    for (const key of ['typicalImpact', 'upperRealisticImpact', 'finalStabilityScore']) {
        assert.ok(Math.abs(larger[key] / original[key] - expectedRatio) < 1e-12, key);
    }
});

test('rounding floor is a propagated next-record uncertainty, not a quantity bonus', () => {
    const result = evaluate(Array.from({ length: 20 }, () => row(10)));
    const q = result.typicalNextSampleSize;
    const expected = q / (result.sampleQuantity + q) * (0.25 / q);
    assert.equal(result.typicalImpact, expected);
    assert.ok(result.typicalImpact > 0, 'floor raises the otherwise zero empirical impact');
});

console.log(`${checks} stability checks passed`);
