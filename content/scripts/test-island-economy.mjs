import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Run browser ESM against the real catalog without booting UI or fetching prices.
const storage = new Map();
class Storage {
    getItem(k) { return storage.get(k) ?? null; }
    setItem(k, v) { storage.set(k, v); }
    removeItem(k) { storage.delete(k); }
}
const context = vm.createContext({
    console, URL, URLSearchParams, setTimeout, clearTimeout, Storage, CustomEvent: class {},
    location: { search: '', pathname: '/' },
    localStorage: new Storage(),
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, dispatchEvent() {} }
});
const modules = new Map();
function moduleFor(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    let code = fs.readFileSync(file, 'utf8');
    if (file.endsWith(`${path.sep}nav.js`)) code = 'export function initNav() {}';
    if (file.endsWith(`${path.sep}island-planner-v2.js`)) code = code.replace(/init\(\);\s*$/, 'export { state };');
    const module = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, module);
    return module;
}
async function load(file) {
    const module = moduleFor(file);
    if (module.status === 'unlinked') await module.link((specifier, parent) => moduleFor(path.resolve(path.dirname(parent.identifier), specifier)));
    return module;
}
const storeModule = await load('content/js/db/store.js');
await storeModule.evaluate();
const store = storeModule.namespace;
const schema = (await load('content/js/db/schema.js')).namespace;
for (const [name, table] of Object.entries(schema.tables)) {
    if (table.seedUrl) store.replaceAllRows(name, JSON.parse(fs.readFileSync(table.seedUrl, 'utf8')));
}
const economyModule = await load('content/js/core/island-economy.js');
await economyModule.evaluate();
const economy = economyModule.namespace;
const stats = (await load('content/js/core/island-yield-stats.js')).namespace;
const config = (await load('content/js/core/island/economy-config.js')).namespace;
const feeding = (await load('content/js/core/island/feeding.js')).namespace;
const v2Module = await load('content/js/tools/island-planner-v2.js');
await v2Module.evaluate();
const v2 = v2Module.namespace;
const market = (await load('content/js/core/market.js')).namespace;
const wheat = economy.listCrops().find((p) => p.key === 'wheat');
const chicken = economy.listLivestock().find((p) => p.key === 'chicken');
assert.ok(wheat && chicken, 'real catalog loaded');
store.replaceAllRows('islandYieldLogs', []);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }

test('nine slots, crop premium/city, focus changes returns only', () => {
    assert.equal(economy.plantSlots(), 9);
    near(stats.standardPlantYield(wheat, 'Martlock', true), 9.5, 'intentional empirical premium city yield');
    near(stats.standardPlantYield(wheat, 'Martlock', false), 4.95, 'free city');
    near(stats.effectivePlantYield(wheat, 'Fort Sterling', { water: true }).qty, 9, 'water yield');
    near(stats.standardSeedReturn(wheat, true), 1.4, 'water return');
});
test('observed returns above 100% and observed yields stay intact', () => {
    store.replaceAllRows('islandYieldLogs', [{ islandCity: 'Martlock', itemKey: 'wheat', itemType: 'plant', premium: true, water: true, seedsPlanted: 10, seedsReturned: 14, plantsHarvested: 100 }]);
    near(stats.effectiveSeedReturn(wheat, 'Martlock', { water: true }).rate, 1.4, 'observed return');
    near(stats.effectivePlantYield(wheat, 'Martlock', { water: true }).qty, 10, 'no duplicate city bonus');
    store.replaceAllRows('islandYieldLogs', []);
});
test('200% seed and offspring returns remain expected replacement quantities', () => {
    store.replaceAllRows('islandYieldLogs', [
        { islandCity: 'Martlock', itemKey: 'wheat', itemType: 'plant', premium: true, water: true, seedsPlanted: 10, seedsReturned: 20, plantsHarvested: 95 },
        { islandCity: 'Martlock', itemKey: 'chicken', itemType: 'animal', premium: true, water: true, seedsPlanted: 10, seedsReturned: 20, plantsHarvested: 10 }
    ]);
    near(stats.effectiveSeedReturn(wheat, 'Martlock', { water: true }).rate, 2, 'seed expected return');
    near(stats.effectiveAnimalReturn(chicken, 'Martlock', { focus: true }).rate, 2, 'offspring expected return');
    store.replaceAllRows('islandYieldLogs', []);
});
test('mechanical hours survive while economics uses daily collection periods', () => {
    assert.equal(config.cropHours(), 22);
    assert.equal(config.animalCycleHours(chicken, false, 'product'), 22);
    assert.equal(config.animalCycleHours(chicken, false, 'grow'), 44);
    assert.equal(config.animalCycleHours(chicken, true, 'grow'), 22);
    for (const [mechanical, planning] of [[1, 24], [22, 24], [24, 24], [24.001, 48], [44, 48], [46, 48], [48, 48], [48.001, 72], [72, 72]]) {
        assert.equal(economy.planCycleHours(mechanical), planning);
    }
    for (const invalid of [null, NaN, 0, -1]) assert.equal(economy.planCycleHours(invalid), null);
});

const fixture = { wheat: 100, egg: 200, seed: 1000, adult: 5000, baby: 1000, other: 10000 };
function priceRows({ herbPrice, wheatPrice = fixture.wheat, eggPrice = fixture.egg, baby = true } = {}) {
    const prices = new Map(economy.allPriceItemIds().map((id) => [id, fixture.other]));
    prices.set(wheat.plantId, wheatPrice);
    prices.set(wheat.seedId, fixture.seed);
    prices.set(chicken.productId, eggPrice);
    prices.set(chicken.grownId, fixture.adult);
    prices.set(chicken.babyId, fixture.baby);
    if (!baby) prices.delete(chicken.babyId);
    if (herbPrice != null) prices.set(economy.listHerbs()[0].plantId, herbPrice);
    return [...prices].flatMap(([item_id, price]) => ['Fort Sterling', 'Martlock'].map((city) => ({ item_id, city, quality: 1, sell_price_min: price, buy_price_max: price })));
}
function plan(items, { premium = true, focus = false, ...prices } = {}) {
    v2.state.priceIndex = market.indexPrices(priceRows(prices));
    v2.state.draft = { premium, focus, islandCity: 'Fort Sterling', sellCity: 'Fort Sterling', seedSide: 'sell', harvestSide: 'buy', slots: items.map((item, i) => ({ id: `R${i + 1}`, item, focus, productionMode: 'product' })) };
    v2.calculateIslandPlan();
    return v2.state.derived;
}
// One collection per real day, not theoretical 24/22 throughput.
const daily = 1;
test('chicken market feed uses 9 favourite wheat per animal, no recurring adult cost', () => {
    const p = plan(['chicken'], { baby: false });
    const slot = p.slots.get('R1');
    near(slot.market, 81 * daily, 'feed');
    near(slot.output, 178.2 * daily, 'eggs');
    near(slot.expense, 8100 * daily, 'feed-only cost');
    near(slot.net, (178.2 * 192 - 8100) * daily, 'profit');
});
test('favourite-feed policy ignores cheaper herbs and keeps favourite quantities', () => {
    const p = plan(['chicken'], { herbPrice: 40 });
    near(p.slots.get('R1').market, 81, 'favourite quantity');
    near(p.summary.expense, 8100, 'favourite cost despite cheaper alternative');
    assert.equal(feeding.feedPlants(chicken).length, 1);
    assert.equal(feeding.feedPlants(chicken)[0].plantId, wheat.plantId);
});
test('crop vs pasture: internal opportunity value is net sale, transfers cancel', () => {
    const crops = plan(['wheat', 'wheat']);
    const mixed = plan(['wheat', 'chicken']);
    const farm = mixed.slots.get('R1'), pasture = mixed.slots.get('R2');
    near(farm.internalTransferOut, 81 * 96 * daily, 'lost net sale');
    near(pasture.internalTransferIn, farm.internalTransferOut, 'balanced transfer');
    near(pasture.market, 0, 'self-fed');
    near(mixed.summary.net, (178.2 * 192 - 3600) * daily, 'only external revenue minus seed expense');
    near(mixed.summary.contribution, mixed.summary.net, 'no double count');
    near(crops.summary.net, 2 * (81 * 96 - 3600) * daily, 'two crop plots');
    near(mixed.summary.net - crops.summary.net, (178.2 * 192 - 2 * 81 * 96 + 3600) * daily, 'same two plots and duration');
});
test('free eggs retain a separate daily planning cycle and half yield; focus does not change eggs', () => {
    const free = plan(['chicken'], { premium: false }).slots.get('R1');
    near(free.productionHours, 24, 'product planning hours');
    near(free.output, 89.1 * daily, 'free eggs');
    near(plan(['chicken'], { focus: true }).slots.get('R1').output, plan(['chicken']).slots.get('R1').output, 'focus');
});
test('partial internal feeding, surplus and selling by order use net opportunity prices', () => {
    plan(['wheat', 'chicken'], { premium: false });
    v2.state.draft.harvestSide = 'sell';
    v2.calculateIslandPlan();
    const p = v2.state.derived;
    near(p.slots.get('R2').market, 40.5 * daily, 'shortfall');
    near(p.slots.get('R2').internalTransferIn, 40.5 * 99 * (1 - .08 - .025) * daily, 'net order alternative');
    near(p.summary.contribution, p.summary.net, 'partial transfer balance');
    const surplus = plan(['wheat', 'wheat', 'chicken']);
    near(surplus.summary.net, (178.2 * 192 + 81 * 96 - 7200) * daily, 'surplus sold once');
});
function ctx(options = {}) { return { premium: true, water: false, focus: false, islandCity: 'Fort Sterling', sellCity: 'Fort Sterling', buySide: 'sell', sellSide: 'buy', priceIndex: market.indexPrices(priceRows(options)), ...options }; }
test('V1 product ledger works without baby price and retains favourite feed policy', () => {
    const row = economy.listIslandLedger(ctx({ baby: false, herbPrice: 40 })).find((r) => r.itemKey === 'chicken' && r.pathId === 'feed' && r.feedMode === 'market');
    near(row.cost, 8100, 'favourite cycle cost');
    assert.equal(row.missing.length, 0);
    near(row.hours, 24, 'product planning cycle');
});
test('non-fixed animals retain crop-only choices and compare best.feed.unit correctly', () => {
    const animal = economy.listPastureMounts().find((a) => !a.feedFixed && a.baseHours === 92);
    assert.ok(animal, 'catalog mount with 46h premium mechanical cycle');
    assert.ok(feeding.feedPlants(animal).every((p) => p.kind === 'crop'));
    const rows = economy.listIslandLedger(ctx({ herbPrice: 1 })).filter((r) => r.itemKey === animal.key);
    for (const mode of ['market', 'island']) {
        const row = rows.find((r) => r.feedMode === mode && r.pathId === 'grow');
        assert.equal(row.feedLabel, wheat.label, 'later, cheaper crop replaces initial candidate');
        near(row.hours, 48, '46h production collected at the 48h daily visit');
        near(row.perDay, row.profit / 2, 'half of cycle profit per planning day');
        if (mode === 'island') {
            near(row.opportunity.farmsPerPasture, animal.pens * animal.feedQty / (81 * 2), 'two daily crop collections per animal cycle');
        }
    }
});
test('free meat grows over two planning days while adult products collect daily', () => {
    plan(['chicken'], { premium: false });
    const product = v2.state.derived.slots.get('R1');
    near(product.productionHours, 24, 'adult product planning cycle');
    near(product.expense, 8100, 'daily product feed');
    v2.state.draft.slots[0].productionMode = 'butcher';
    v2.calculateIslandPlan();
    const meat = v2.state.derived.slots.get('R1');
    near(meat.productionHours, 48, 'free growth planning cycle');
    near(meat.expense, (8100 + 3600) / 2, 'growth inputs spread over two days');
});
test('V1 optimizer plot totals equal summed contributions', () => {
    const p = economy.optimizeIsland({ ...ctx(), plots: 2 });
    assert.equal(p.slots.length, 2);
    near(p.totalDay, p.slots.reduce((sum, s) => sum + s.perDay, 0), 'optimizer total');
    assert.ok(p.totalDay >= 2 * (81 * 96 - 3600) * daily, 'crop baseline feasible');
});
test('V1 chooses the mixed two-plot chain when it beats both alternatives, with no duplicate seed/opportunity cost', () => {
    const animals = store.getAll('animals'), plants = store.getAll('plants');
    try {
        store.replaceAllRows('animals', animals.filter((a) => a.key === 'chicken'));
        store.replaceAllRows('plants', plants.filter((a) => a.key === 'wheat'));
        const options = ctx({ eggPrice: 70, baby: false });
        const p = economy.optimizeIsland({ ...options, plots: 2 });
        assert.equal(p.mode, 'island-feed');
        assert.equal(p.slots.filter((s) => s.role === 'feed').length, 1);
        near(p.totalDay, (178.2 * 70 * .96 - 3600) * daily, 'one complete farm seed expense');
        near(p.totalDay, p.slots.reduce((sum, s) => sum + s.perDay, 0), 'chain contributions');
        assert.ok(p.totalDay > 2 * (81 * 96 - 3600) * daily, 'beats two crop plots');
        assert.ok(p.totalDay > 2 * (178.2 * 70 * .96 - 8100) * daily, 'beats two market-fed pastures');
    } finally {
        store.replaceAllRows('animals', animals);
        store.replaceAllRows('plants', plants);
    }
});
test('livestock focus fallback survives null nurture metadata; product chains match catalog', () => {
    const products = { chicken: 'T3_EGG', goat: 'T4_MILK', goose: 'T5_EGG', sheep: 'T6_MILK', cow: 'T8_MILK' };
    for (const animal of economy.listLivestock()) {
        near(stats.standardAnimalReturn(animal, { focus: true }), animal.seedReturn + animal.waterBonus, `${animal.key} offspring`);
        assert.equal(animal.productId, products[animal.key] ?? null);
        if (!animal.productId) continue;
        near(stats.effectiveAnimalProductYield(animal, 'no-bonus', { premium: true }).qty, 18, 'premium product');
        near(stats.effectiveAnimalProductYield(animal, 'no-bonus', { premium: false }).qty, 9, 'free product');
        near(stats.effectiveAnimalProductYield(animal, animal.bonusCities[0], { focus: true }).qty, 19.8, 'city product');
    }
});
test('meat/live require replacement inputs; egg production never does', () => {
    plan(['chicken']);
    const entry = v2.state.draft.slots[0];
    entry.productionMode = 'butcher';
    v2.calculateIslandPlan();
    near(v2.state.derived.summary.expense, (8100 + 3600) * daily, 'meat feed plus replacement');
    entry.focus = true; v2.state.draft.focus = true;
    v2.calculateIslandPlan();
    near(v2.state.derived.summary.expense, (8100 - 3600) * daily, 'focus replacement credit');
    entry.productionMode = 'product';
    v2.calculateIslandPlan();
    near(v2.state.derived.summary.expense, 8100 * daily, 'eggs no replacement credit');
});
test('fixed input/output prices stay separate and internal transfers deduct sales fees', () => {
    plan(['wheat', 'chicken']);
    v2.state.fixedPrices = [
        { itemId: wheat.seedId, role: 'input', price: 1000 },
        { itemId: wheat.plantId, role: 'input', price: 150 },
        { itemId: wheat.plantId, role: 'output', price: 100 },
        { itemId: chicken.productId, role: 'output', price: 200 }
    ];
    v2.state.draft.seedSide = 'fixed'; v2.state.draft.harvestSide = 'fixed';
    v2.calculateIslandPlan();
    const p = v2.state.derived;
    near(p.slots.get('R2').internalTransferIn, 81 * 100 * .935 * daily, 'fixed net sales alternative');
    near(p.summary.net, (178.2 * 200 * .935 - 3600 * 1.025) * daily, 'fixed cash flow');
    near(p.summary.contribution, p.summary.net, 'fixed transfer balance');
});
test('buy-order replacement setup is applied only to expected missing offspring', () => {
    const options = ctx(); options.buySide = 'buy';
    const row = economy.listIslandLedger(options).find((r) => r.itemKey === 'chicken' && r.pathId === 'grow' && r.feedMode === 'market');
    near(row.profit, 9 * (5000 * .96 - 1001 * 1.025 * .4 - 9 * 101 * 1.025), 'replacement setup');
});
console.log(`${checks} island economy checks passed.`);
