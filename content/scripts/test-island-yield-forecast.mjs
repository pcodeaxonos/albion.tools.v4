import assert from 'node:assert/strict';
import { forecastYieldStability } from '../js/core/island-yield-forecast.mjs';
import { yieldStability, yieldMetricHistory, evaluateYieldMetricHistory, metricYieldStability } from '../js/core/island-yield-stability.mjs';
const row = (rate = 10, size = 100) => ({ seedsPlanted: size, plantsHarvested: rate * size, seedsReturned: size });
const fast = { yieldTask: async () => {} };
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

await test('no data, already stable, and insufficient independent history are explicit', async () => {
    assert.equal((await forecastYieldStability([], {}, fast)).status, 'no-data');
    assert.equal((await forecastYieldStability([row()], {}, fast)).status, 'insufficient');
    assert.equal((await forecastYieldStability([{ ...row(), date:'2026-10-07' }, { ...row(), date:'2026-10-07' }], {}, fast)).status, 'insufficient');
    assert.equal((await forecastYieldStability(Array.from({length:20},()=>row()), {}, fast)).status, 'stable');
});

await test('shared evaluator leaves observed confidence diagnostics exactly unchanged', async () => {
    const rows = Array.from({length:10},(_,i)=>row(i%2 ? 10.5 : 9.5, i%2 ? 100 : 50));
    const display = {reference:9.8};
    assert.deepEqual(evaluateYieldMetricHistory(yieldMetricHistory(rows,'plantsHarvested'), display),
        metricYieldStability(rows,'plantsHarvested',display));
});

await test('same-day raw log splitting changes only raw-record conversion, never Q or independent batches', async () => {
    const rows=Array.from({length:10},(_,i)=>({...row(i%2 ? 10.5 : 9.5),date:`2026-10-${String(i+1).padStart(2,'0')}`}));
    const split=rows.flatMap(r=>Array.from({length:2},()=>({...r,seedsPlanted:r.seedsPlanted/2,
        plantsHarvested:r.plantsHarvested/2,seedsReturned:r.seedsReturned/2})));
    const options={includeReturn:false};
    const original=await forecastYieldStability(rows,options,fast);
    const divided=await forecastYieldStability(split,options,fast);
    assert.equal(original.rawRecordCount,10);
    assert.equal(divided.rawRecordCount,20);
    assert.equal(original.independentBatchCount,10);
    assert.equal(divided.independentBatchCount,10);
    assert.equal(original.medianRawRecordQuantity,100);
    assert.equal(divided.medianRawRecordQuantity,50);
    assert.equal(original.medianIndependentBatchQuantity,100);
    assert.equal(divided.medianIndependentBatchQuantity,100);
    for(const key of ['optimistic','expected','cautious']) {
        const a=original.scenarios[key],b=divided.scenarios[key];
        assert.equal(a.requiredTotalQuantity,b.requiredTotalQuantity);
        assert.equal(a.requiredAdditionalQuantity,b.requiredAdditionalQuantity);
        assert.equal(a.estimatedAdditionalIndependentBatches,b.estimatedAdditionalIndependentBatches);
        assert.equal(b.approximateAdditionalRawRecords,2*a.approximateAdditionalRawRecords);
        assert.equal(b.estimatedAdditionalRawRecords,Math.ceil(b.requiredAdditionalQuantity/50));
        assert.equal(b.estimatedAdditionalIndependentBatches,Math.ceil(b.requiredAdditionalQuantity/100));
        assert.deepEqual(a.metrics,b.metrics);
    }
    assert.equal(divided.scenarios.expected.requiredAdditionalQuantity,1806);
    assert.equal(divided.scenarios.expected.estimatedAdditionalRawRecords,37);
    assert.equal(divided.scenarios.expected.estimatedAdditionalIndependentBatches,19);
});

await test('quantity unit diagnostics remain available without enough history to forecast', async () => {
    const rows=[{...row(10,50),date:'2026-10-07'},{...row(10,50),date:'2026-10-07'}];
    const result=await forecastYieldStability(rows,{},fast);
    assert.equal(result.status,'insufficient');
    assert.equal(result.rawRecordCount,2);
    assert.equal(result.independentBatchCount,1);
    assert.equal(result.medianRawRecordQuantity,50);
    assert.equal(result.medianIndependentBatchQuantity,100);
    const empty=await forecastYieldStability([],{},fast);
    assert.equal(empty.rawRecordCount,0);
    assert.equal(empty.independentBatchCount,0);
    assert.equal(empty.medianRawRecordQuantity,null);
    assert.equal(empty.medianIndependentBatchQuantity,null);
});

await test('quantity target has first-passing integer Q and matches the analytic upper bound', async () => {
    const rows=Array.from({length:10},(_,i)=>row(i%2 ? 10.5 : 9.5));
    const forecast=await forecastYieldStability(rows,{includeReturn:false},fast);
    const result=forecast.scenarios.expected;
    assert.equal(forecast.status,'estimated');
    assert.equal(result.estimatedAdditionalIndependentBatches,19);
    assert.equal(result.requiredTotalQuantity,2806);
    assert.equal(result.requiredAdditionalQuantity,1806);
    assert.equal(result.estimatedAdditionalIndependentBatches,Math.ceil(result.requiredAdditionalQuantity/result.medianIndependentBatchQuantity));
    const history=yieldMetricHistory(rows,'plantsHarvested');
    assert.equal(evaluateYieldMetricHistory({...history,sampleQuantity:result.requiredTotalQuantity}).level,4);
    assert.ok(evaluateYieldMetricHistory({...history,sampleQuantity:result.requiredTotalQuantity-1}).level<4);
    const original=metricYieldStability(rows,'plantsHarvested');
    const radius=original.testedNextMax-original.currentMean;
    assert.equal(result.requiredTotalQuantity,Math.ceil(100*(radius/(history.currentMean*0.005)-1)));
    assert.ok(result.lastSatisfiedConditions.some(c=>c.condition==='upperRelativeYieldImpact'));
    assert.ok(result.evaluations<40,'logarithmic Q search, not sequential record projections');
});

await test('large finite counts are retained without a 128-record horizon', async () => {
    const rows=Array.from({length:10},(_,i)=>row(i%2 ? 20 : 0));
    const forecast=await forecastYieldStability(rows,{includeReturn:false},fast);
    assert.ok(forecast.scenarios.expected.estimatedAdditionalIndependentBatches>383);
    assert.equal(forecast.status,'estimated');
    assert.equal('horizon' in forecast,false);
});

await test('cache and forecasting never mutate observations or their confidence', async () => {
    const rows=Array.from({length:10},(_,i)=>row(i%2?10.2:9.8));
    const before=JSON.stringify(rows), score=JSON.stringify(yieldStability(rows));
    const pending=forecastYieldStability(rows,{},fast);
    assert.equal(pending,forecastYieldStability(rows.map(r=>({...r})),{},fast));
    await pending;
    assert.equal(JSON.stringify(rows),before);
    assert.equal(JSON.stringify(yieldStability(rows)),score);
    assert.notEqual(pending,forecastYieldStability([...rows,row()],{},fast));
});

await test('exact and near-default means find finite Q through the material-direction predicate', async () => {
    for(const mean of [9.5,9.5001]) {
        const rows=Array.from({length:10},(_,i)=>row(mean+(i%2 ? 0.5 : -0.5)));
        const display={reference:9.5};
        const forecast=await forecastYieldStability(rows,{includeReturn:false,harvestDisplay:display},fast);
        assert.equal(forecast.status,'estimated');
        for(const scenario of Object.values(forecast.scenarios)) {
            assert.equal(scenario.requiredTotalQuantity,2959);
            assert.ok(scenario.metrics[0].level4Conditions.directionStable);
        }
        const h=yieldMetricHistory(rows,'plantsHarvested');
        const target=forecast.scenarios.expected.requiredTotalQuantity;
        const score=evaluateYieldMetricHistory({...h,sampleQuantity:target},display);
        assert.equal(score.level,4);
        assert.equal(score.rawDirectionStable,false);
        assert.equal(score.currentMaterialDirection,0);
        assert.ok(evaluateYieldMetricHistory({...h,sampleQuantity:target-1},display).level<4);
    }
});

await test('marked outliers and missing required metric history stay excluded', async () => {
    const rows=Array.from({length:10},(_,i)=>row(i%2?10.1:9.9));
    assert.deepEqual(await forecastYieldStability(rows,{},fast),await forecastYieldStability([...rows,{...row(10000),isOutlier:true}],{},fast));
    const product=rows.map(({seedsReturned,...r})=>r);
    assert.equal((await forecastYieldStability(product,{},fast)).status,'insufficient');
    assert.equal((await forecastYieldStability(product,{includeReturn:false},fast)).status,'stable');
});

await test('forecast ignores raw and deviation rounding boundaries through the shared continuous predicate', async () => {
    for (const [mean, reference] of [[10, 9.5], [10.005, null]]) {
        const rows=Array.from({length:10},(_,i)=>row(mean+(i%2 ? 0.5 : -0.5)));
        const display={reference};
        const result=await forecastYieldStability(rows,{includeReturn:false,harvestDisplay:display},fast);
        assert.equal(result.status,'estimated');
        const target=result.scenarios.expected.requiredTotalQuantity;
        const history=yieldMetricHistory(rows,'plantsHarvested');
        const score=evaluateYieldMetricHistory({...history,sampleQuantity:target},display);
        assert.equal(score.level,4);
        assert.equal(score.rawDisplayStable,false);
        assert.equal(score.displayStable,true);
        assert.ok(evaluateYieldMetricHistory({...history,sampleQuantity:target-1},display).level<4);
        if(reference) {
            assert.equal(target,2959, 'continuous reference impact is the binding condition');
            assert.equal(score.deviationDisplayStable,false);
        }
    }
});
await test('all scenarios keep their finite estimates at a neutral reference', async () => {
    const rows=[9.8,9.9,9.95,10,10,10.02,10.05,10.1,10.2,10.25].map(rate=>row(10.027+10*(rate-10.027)));
    const result=await forecastYieldStability(rows,{includeReturn:false,harvestDisplay:{reference:10.027}},fast);
    assert.equal(result.status,'estimated');
    assert.ok(result.scenarios.expected.estimatedAdditionalIndependentBatches>0);
    assert.ok(result.scenarios.optimistic.estimatedAdditionalIndependentBatches>0);
    assert.ok(result.scenarios.cautious.estimatedAdditionalIndependentBatches>0);
});

await test('an exact half-integer deviation boundary has a finite Q target with material direction', async () => {
    const rows=Array.from({length:10},(_,i)=>row(10.55+(i%2 ? 0.5 : -0.5)));
    const display={reference:10};
    const result=await forecastYieldStability(rows,{includeReturn:false,harvestDisplay:display},fast);
    assert.equal(result.status,'estimated');
    const target=result.scenarios.expected.requiredTotalQuantity;
    const history=yieldMetricHistory(rows,'plantsHarvested');
    const score=evaluateYieldMetricHistory({...history,sampleQuantity:target},display);
    assert.equal(score.level,4);
    assert.equal(score.deviationDisplayStable,false);
    assert.equal(score.directionStable,true);
    assert.ok(evaluateYieldMetricHistory({...history,sampleQuantity:target-1},display).level<4);
    assert.ok(result.scenarios.expected.lastSatisfiedConditions.some(c=>c.condition==='upperReferenceImpact'));
    for (const scenario of Object.values(result.scenarios)) {
        assert.equal(scenario.status,'estimated');
        const debug=scenario.reachabilityDebug[0];
        assert.ok(Math.abs(debug.continuousDeviation-5.5)<1e-10);
        assert.ok(debug.deviationRoundingBoundaryDistance<1e-10);
        assert.ok(debug.quantityProbes.at(-1).failedConditions.length===0);
        for(const scale of [1,1000,1000000]) {
            const sampleQuantity=scenario.requiredTotalQuantity*scale;
            const score=evaluateYieldMetricHistory({...history,sampleQuantity},display);
            assert.equal(score.level,4);
            assert.ok(score.maximumDeviationPercentagePointChange<=0.5);
            assert.ok(score.possibleDisplayedValues.some(value=>value.difference==='5'));
            assert.ok(score.possibleDisplayedValues.some(value=>value.difference==='6'));
        }
    }
});

await test('102.50% return rounding has a finite Q target with both displays possible', async () => {
    const rows=Array.from({length:10},(_,i)=>({...row(10),seedsReturned:100*(1.025+(i%2 ? 0.05 : -0.05))}));
    const display={kind:'percent',reference:1};
    const result=await forecastYieldStability(rows,{returnDisplay:display},fast);
    assert.equal(result.status,'estimated');
    for(const scenario of Object.values(result.scenarios)) {
        assert.equal(scenario.requiredTotalQuantity,2806);
        const metric=scenario.metrics.find(value=>value.field==='seedReturn');
        assert.equal(metric.returnPercentageDisplayStable,false);
        assert.ok(metric.possibleDisplayedValues.some(value=>value.actual==='102'));
        assert.ok(metric.possibleDisplayedValues.some(value=>value.actual==='103'));
    }
    const h=yieldMetricHistory(rows,'seedsReturned');
    assert.equal(evaluateYieldMetricHistory({...h,sampleQuantity:2806},display).level,4);
    assert.ok(evaluateYieldMetricHistory({...h,sampleQuantity:2805},display).level<4);
});

await test('missing older output quantities are not credited to the return metric twice', async () => {
    const rows=Array.from({length:10},(_,i)=>({seedsPlanted:100,plantsHarvested:1000,
        ...(i<2 ? {seedsReturned:i%2?200:0} : {})}));
    const result=await forecastYieldStability(rows,{},fast);
    const expected=result.scenarios.expected;
    const returned=expected.metrics.find(metric=>metric.field==='seedReturn');
    assert.equal(returned.currentMetricQuantity,200);
    assert.equal(returned.targetMetricQuantity,200+expected.requiredAdditionalQuantity);
    assert.equal(expected.currentQuantity,1000);
});

console.log(`${checks} forecast checks passed`);
