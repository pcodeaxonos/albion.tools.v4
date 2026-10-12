import assert from 'node:assert/strict';
import fs from 'node:fs';
import { salesEvidence, salesPlanValue } from '../js/core/island-sales-potential.mjs';
const model = `data:text/javascript;base64,${Buffer.from(fs.readFileSync(new URL('../js/core/island/placement-model.js', import.meta.url))).toString('base64')}`;
const load = async file => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('./placement-model.js', model).replaceAll('../../core/island/placement-model.js', model)).toString('base64')}`);
const { salesPlacementUpper, salesProfileValue } = await load('../js/core/island/sales-bound.js');
const { optimizePlacement } = await load('../js/tools/island-planner-v2/optimizer.js');
const now = Date.parse('2026-10-12T12:00:00Z'), days = 28;
const points = Array.from({ length: days }, (_, i) => ({ timestamp: new Date(now - (i + 1) * 86400000).toISOString().slice(0, 10) + 'T00:00:00', item_count: 100, avg_price: 10 }));
assert.equal(salesEvidence(points, days, now).volume, 2800);
assert.equal(salesEvidence([], days, now).reliable, false);
assert.equal(salesEvidence(points.slice(10), days, now).reliable, false);
assert.equal(salesEvidence(points.map(p => ({ ...p, item_count: null })), days, now).reliable, false);
const spike = points.map((p, i) => ({ ...p, avg_price: i === 0 ? 10000 : 10 }));
assert.equal(salesEvidence(spike, days, now, 1000).price, 10);
assert.equal(salesEvidence(points, days, now, 5).price, 5);
const evidence = new Map([['rare', { reliable: true, volume: 10 }], ['common', { reliable: true, volume: 10000 }]]);
const profile = (id, quantity, price, cost) => ({ entry: { item: id }, net: quantity * price - cost, supplies: [], feed: null, sale: { id, quantity, unitValue: price } });
const rare = profile('rare', 10, 100, 100), common = profile('common', 100, 5, 100);
const calculate = profiles => ({ summary: { expense: profiles.reduce((sum, p) => sum + p.sale.quantity * p.sale.unitValue - p.net, 0) }, slots: new Map(profiles.map((p, i) => [i, { economic: true, saleItemId: p.sale.id, netOutput: p.sale.quantity, saleEffective: p.sale.unitValue, externalExpense: p.sale.quantity * p.sale.unitValue - p.net }])) });
const score = profiles => salesPlanValue(calculate(profiles), evidence, 1, 10).net;
const upperBound = (fixed, options, remaining) => salesPlacementUpper(fixed, options, remaining, new Map([['rare', 1], ['common', 1000]]));
const result = await optimizePlacement([rare, common], [], 3, { score, upperBound });
assert.deepEqual(result.entries.map(e => e.item), ['common', 'common', 'common']);
assert.equal(score([rare]), 0);
assert.equal(score([rare, rare]), -100);
const excess = salesPlanValue(calculate([rare, rare]), evidence, 1, 10);
assert.equal(excess.rows[0].sold, 1);
assert.equal(excess.rows[0].stock, 19);
assert.equal(excess.rows[0].sellDays, 20);
assert.throws(() => salesPlanValue(calculate([rare]), new Map(), 1, 10), /güvenilir/);
const acquired = { ...common, purchases: [{ id: 'seed', quantity: 2 }] };
for (let capacity = 0; capacity <= 7; capacity++) {
    const purchaseLimits = new Map([['seed', capacity]]), saleLimits = new Map([['common', 1000]]);
    const result = await optimizePlacement([acquired], [], 3, {
        score: profiles => salesProfileValue(profiles, saleLimits, purchaseLimits),
        upperBound: (fixed, options, remaining) => salesPlacementUpper(fixed, options, remaining, saleLimits, purchaseLimits)
    });
    assert.equal(result.entries.length, Math.min(3, Math.floor(capacity / 2)), 'total seed procurement shared across slots');
}
const crop = { ...profile('wheat', 10, 10, 20), supplies: [{ id: 'wheat', quantity: 10, unitValue: 10 }], purchases: [{ id: 'seed', quantity: 1 }] };
const hen = { ...profile('eggs', 5, 30, 200), feed: { cycles: 1, marketCycleCost: 200, choices: [{ id: 'wheat', quantity: 10 }] }, purchases: [{ id: 'wheat', quantity: 10 }], feedPurchase: { id: 'wheat', quantityPerCycle: 10 } };
const procurement = new Map([['seed', 1], ['wheat', 0]]), sales = new Map([['wheat', 100], ['eggs', 100]]);
assert.equal(salesProfileValue([hen], sales, procurement), -Infinity);
assert.equal(salesProfileValue([crop, hen], sales, procurement), 130, 'internal feed repairs external procurement need');
const fed = await optimizePlacement([crop, hen], [], 2, { score: profiles => salesProfileValue(profiles, sales, procurement), upperBound: (fixed, options, remaining) => salesPlacementUpper(fixed, options, remaining, sales, procurement) });
assert.equal(fed.net, 130);
// Compare the capacity-aware certified bound and optimizer with brute force.
for (let cap = 0; cap < 8; cap++) {
    evidence.set('rare', { reliable: true, volume: cap * 10 });
    const upperBound = (fixed, options, remaining) => salesPlacementUpper(fixed, options, remaining, new Map([['rare', cap], ['common', 1000]]));
    let best = score([rare]);
    for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3 - a; b++) best = Math.max(best, score([rare, ...Array(a).fill(rare), ...Array(b).fill(common)]));
    const result = await optimizePlacement([rare, common], [rare], 3, { score, upperBound });
    assert.ok(Math.abs(result.net - best) < 1e-7);
}
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/island-sales-history-live.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
for (const row of fixture.rows) {
    const stats = salesEvidence(row.data, 28, Date.parse(fixture.capturedAt));
    assert.equal(stats.reliable, true, row.item_id);
    assert.ok(stats.volume > 0 && stats.price > 0);
    console.log('Live AODP fixture', row.item_id, JSON.stringify(stats));
}
console.log('Sales potential: evidence, spikes, capacity, shared supply, inventory, costs, exact optimization and live fixtures passed.');
