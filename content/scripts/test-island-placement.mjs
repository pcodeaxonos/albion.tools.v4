import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const modelSource = await fs.readFile(new URL('../js/core/island/placement-model.js', import.meta.url), 'utf8');
const modelUrl = `data:text/javascript;base64,${Buffer.from(modelSource).toString('base64')}`;
const { placementValue, allocateInternalFeed } = await import(modelUrl);
const source = (await fs.readFile(new URL('../js/tools/island-planner-v2/optimizer.js', import.meta.url), 'utf8')).replace('../../core/island/placement-model.js', modelUrl);
const { optimizePlacement } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const option = (item, net, supplies = [], feed = null) => ({ entry: { item }, net, supplies, feed });
const supply = (id, quantity, unitValue) => ({ id, quantity, unitValue });
const feed = (cycles, marketCycleCost, choices) => ({ cycles, marketCycleCost, choices });
function brute(options, fixed, slots) {
    let best = placementValue(fixed).net;
    function visit(index, remaining, selected) {
        best = Math.max(best, placementValue([...fixed, ...selected]).net);
        if (!remaining || index === options.length) return;
        for (let count = 0; count <= remaining; count++) visit(index + 1, remaining - count, [...selected, ...Array(count).fill(options[index])]);
    }
    visit(0, slots, []);
    return best;
}
let checks = 0, seed = 17;
const random = max => { seed = (seed * 16807) % 2147483647; return seed % max; };
for (let trial = 0; trial < 40; trial++) {
    const costs = [random(8) + 1, random(8) + 1];
    const options = Array.from({ length: 5 }, (_, i) => option(String(i), random(30) - 15,
        i < 2 ? [supply(String(i), random(5) + 1, costs[i])] : [],
        i >= 2 ? feed(random(3) + 1, random(15) + 1, [{ id: '0', quantity: random(3) + 1 }, { id: '1', quantity: random(3) + 1 }]) : null));
    const fixed = trial % 2 ? [options[0], options[3]] : [];
    const result = await optimizePlacement(options, fixed, 3);
    assert.ok(Math.abs(result.net - brute(options, fixed, 3)) < 1e-7, `exhaustive comparison ${trial}`);
    assert.ok(result.entries.length <= 3);
    assert.ok(result.marginalNet >= 0);
    // Fractional-plot relaxation must bound every integer completion.
    assert.ok(placementValue(fixed, options, 3).upper + 1e-7 >= result.net);
    checks++;
}
const crop = option('crop', 10, [supply('crop', 10, 1)]);
const animal = option('animal', 12, [], feed(1, 40, [{ id: 'crop', quantity: 10 }]));
for (const [fixed, choices, expected] of [[[animal], [crop], 52], [[crop], [animal], 52]]) {
    const result = await optimizePlacement(choices, fixed, 1);
    assert.equal(result.net, expected); assert.equal(result.entries.length, 1); checks++;
}
const loss = await optimizePlacement([option('loss', -5)], [], 16);
assert.equal(loss.net, 0); assert.equal(loss.entries.length, 0); checks++;
const foods = [option('cheap', 0, [supply('cheap', 5, 1)]), option('costly', 0, [supply('costly', 10, 3)]),
    option('animal', 0, [], feed(1, 50, [{ id: 'cheap', quantity: 10 }, { id: 'costly', quantity: 10 }]))];
const transfers = allocateInternalFeed(foods);
assert.equal(transfers.find(t => t.id === 'cheap').used, 5);
assert.equal(transfers.find(t => t.id === 'costly').used, 5);
assert.equal(placementValue(foods).net, 30); checks++;
// Higher nominal sale value can still be the cheapest feed per nutrition cycle.
const nutrition = [option('a', 0, [supply('a', 4, 3)]), option('b', 0, [supply('b', 10, 2)]),
    option('animal', 0, [], feed(1, 30, [{ id: 'a', quantity: 4 }, { id: 'b', quantity: 10 }]))];
assert.equal(allocateInternalFeed(nutrition)[0].id, 'a'); checks++;
const unprofitableFeed = [option('crop', 0, [supply('crop', 10, 5)]), option('animal', 0, [], feed(1, 30, [{ id: 'crop', quantity: 10 }]))];
assert.equal(allocateInternalFeed(unprofitableFeed).length, 0); checks++;
// Global allocation: flexible consumers must not steal scarce feed from others.
const competing = [option('a', 0, [supply('a', 10, 1)]), option('b', 0, [supply('b', 10, 2)]),
    option('flexible', 0, [], feed(1, 40, [{ id: 'a', quantity: 10 }, { id: 'b', quantity: 10 }])),
    option('restricted', 0, [], feed(1, 50, [{ id: 'a', quantity: 10 }]))];
assert.equal(placementValue(competing).net, 60); checks++;
const focused = await optimizePlacement([option('focus-off', 10), option('focus-on', 20)], [], 1);
assert.equal(focused.entries[0].item, 'focus-on'); checks++;
await assert.rejects(optimizePlacement([crop], [], 1, { cancelled: () => true }), /iptal/); checks++;
console.log(`${checks} placement optimizer checks passed.`);