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
    if (file.endsWith(`${path.sep}forms.js`)) code = 'export function initFloatingLabels() {}';
    if (file.endsWith(`${path.sep}island-planner-v2.js`)) code = code.replace(/init\(\);\s*$/, 'export { state, priceSummaryLabel, renderPriceSegment, priceLookup, fetchPlanPrices, renderDetail, renderSummary, renderControls };');
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

test('daily purchase expense lines reconcile order fees and retain missing prices', () => {
    const lines = v2.purchaseExpenseLines('Yem', 90, { price: 100, setup: true }, 9225);
    near(lines[0].cost, 9000, 'daily purchase base');
    near(lines[1].cost, 225, 'daily order fee');
    near(lines.reduce((sum, line) => sum + line.cost, 0), 9225, 'daily expense total');
    assert.equal(v2.purchaseExpenseLines('Yem', 90, null, null)[0].cost, null);
    assert.equal(v2.purchaseExpenseLines('Yavru', 0, null, 0)[0].cost, 0);
});

test('stability considers both return and output, missing fields, zero and invalid inputs', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ seedsPlanted: 10, plantsHarvested: 90, seedsReturned: i % 2 ? 20 : 0 }));
    const result = stats.yieldStability(rows);
    assert.equal(result.harvest.level, 4);
    assert.ok(result.seedReturn.level < 4);
    assert.equal(result.level, result.seedReturn.level);
    const missing = rows.map(({ seedsReturned, ...row }) => row);
    assert.equal(stats.yieldStability(missing).level, 1);
    assert.equal(stats.yieldStability(missing, { includeReturn: false }).level, 4);
    assert.equal(stats.yieldStability([]).level, 0);
    assert.equal(stats.yieldStability(rows.slice(0, 1)).level, 1);
    assert.equal(stats.yieldStability([{ seedsPlanted: 0, plantsHarvested: 100 }]).level, 0);
    assert.equal(stats.yieldStability(rows.map(row => ({ ...row, seedsReturned: 0 }))).seedReturn.level, 4,
        'a realistic positive return is permitted but its bounded absolute impact is negligible');
});

test('confidence uses only the matching group and excludes marked outliers', () => {
    const base = { islandCity: 'Martlock', itemKey: 'wheat', itemType: 'plant', premium: true, water: true, seedsPlanted: 10, seedsReturned: 14, plantsHarvested: 100 };
    const included = [base, { ...base, seedsPlanted: 20, plantsHarvested: 200, seedsReturned: 28 }, base];
    store.replaceAllRows('islandYieldLogs', [...included,
        ...[true, 'true'].map((isOutlier) => ({ ...base, isOutlier, plantsHarvested: 10000 })),
        ...[{ islandCity: 'Lymhurst' }, { itemKey: 'carrot' }, { itemType: 'animal' }, { premium: false }, { water: false }]
            .map((other) => ({ ...base, ...other, plantsHarvested: 10000 }))
    ]);
    const avg = stats.yieldAverage('Martlock', 'wheat', { water: true, includeConfidence: true });
    assert.equal(avg.n, 3);
    assert.equal(avg.seedsPlanted, 40);
    near(avg.avgPlantYield, 10, 'unchanged weighted output');
    near(avg.avgSeedReturn, 56 / 40, 'unchanged weighted return');
    assert.equal(JSON.stringify(avg.confidence), JSON.stringify(stats.yieldStability(included)));
    store.replaceAllRows('islandYieldLogs', []);
});

test('period-scoped yield averages exclude records outside the supplied period', () => {
    const base = { islandCity: 'Martlock', itemKey: 'wheat', itemType: 'plant', premium: true, water: false, seedsPlanted: 10, seedsReturned: 7 };
    const current = { ...base, plantsHarvested: 90 };
    store.replaceAllRows('islandYieldLogs', [current, { ...base, plantsHarvested: 200 }]);
    near(stats.yieldAverage('Martlock', 'wheat', { logRows: [current] }).avgPlantYield, 9, 'selected period only');
    assert.equal(stats.yieldAverage('Martlock', 'wheat', { logRows: [] }), null);
    store.replaceAllRows('islandYieldLogs', []);
});

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
    v2.state.draft.seedFixed = true; v2.state.draft.harvestFixed = true;
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
test('V2 trial placement does not mutate the visible plan or derived totals', () => {
    plan(['wheat', 'chicken']);
    const visible = v2.state.derived;
    const draft = JSON.stringify(v2.state.draft);
    const trial = v2.calculateIslandPlan({ entries: [v2.state.draft.slots[0]], update: false });
    assert.equal(v2.state.derived, visible);
    assert.equal(JSON.stringify(v2.state.draft), draft);
    assert.ok(Number.isFinite(trial.summary.net));
    assert.equal(trial.slots.size, 1);
    assert.equal(v2.calculateIslandPlan({ entries: [], update: false }).summary.net, 0);
});
test('V2 price summary handles missing and stale prices without UI variables', () => {
    assert.equal(v2.priceSummaryLabel({ missing: 2, stale: 3 }), '2 eksik · 3 güncel değil');
    assert.equal(v2.priceSummaryLabel({ missing: 0, stale: 3 }), '3 güncel değil');
    assert.equal(v2.priceSummaryLabel({ missing: 2, stale: 0 }), '2 eksik');
    assert.equal(v2.priceSummaryLabel({ missing: 0, stale: 0 }), 'Güncel');
});
test('V2 Focus totals use editable item defaults for watering and nurture', () => {
    plan(['chicken'], { focus: true });
    v2.state.draft.slots[0].productionMode = 'butcher';
    v2.calculateIslandPlan();
    near(v2.state.derived.summary.focus, chicken.defaultFocusPerUse * chicken.maxNurtureCount * chicken.pens, 'daily nurture');
    const mixed = plan(['wheat', 'chicken'], { focus: true });
    assert.equal(mixed.summary.focus, wheat.defaultFocusPerUse * config.plantSlots(), 'adult product needs no focus');
    assert.equal(mixed.slots.get('R1').dependencies.focus.length, 0);
    assert.equal(plan(['wheat', 'chicken']).summary.focus, 0);
});
async function placementTest(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
await placementTest('V2 filling preserves occupied and locked slots; validates marginal total against engine', async () => {
    plan(['wheat']);
    const fixed = v2.state.draft.slots[0];
    v2.state.draft.islandLevel = 2;
    v2.state.draft.slots.push({ id: 'R2', item: null }, { id: 'R3', item: 'chicken', productionMode: 'product' }, { id: 'R16', item: null });
    const before = JSON.stringify(v2.state.draft);
    const profile = v2.calculateIslandPlan({ entries: [{ id: 'trial', item: 'chicken', productionMode: 'product' }], update: false }).profiles[0];
    const { result, next, derived } = await v2.optimizeDraftPlacement([profile], { isLocked: id => id === 'R16' });
    assert.equal(next[0], fixed);
    assert.equal(next[2], v2.state.draft.slots[2]);
    assert.equal(next[3], v2.state.draft.slots[3]);
    assert.equal(JSON.stringify(v2.state.draft), before, 'trial cannot apply itself');
    near(result.marginalNet, derived.summary.net - result.baseline, 'marginal objective');
    near(result.net, derived.summary.net, 'engine validation');
});
await placementTest('V2 existing animal demand changes the best addition', async () => {
    plan(['chicken']);
    v2.state.draft.slots.push({ id: 'R2', item: null });
    v2.state.draft.islandLevel = 6;
    const crop = v2.calculateIslandPlan({ entries: [{ id: 'trial', item: 'wheat' }], update: false }).profiles[0];
    const { result, derived } = await v2.optimizeDraftPlacement([crop]);
    near(result.net, derived.summary.net, 'animal + crop');
    assert.ok(result.marginalNet > crop.net, 'existing feed demand supplies synergy');
});
await placementTest('V2 missing baseline prices stop filling without modifying draft', async () => {
    plan(['chicken'], { baby: false });
    v2.state.draft.slots[0].productionMode = 'grow';
    const before = JSON.stringify(v2.state.draft);
    await assert.rejects(v2.optimizeDraftPlacement([]), /hesaplanamıyor/);
    assert.equal(JSON.stringify(v2.state.draft), before);
});
await placementTest('V2 catalog-wide 16-slot filling agrees with the complete engine', async () => {
    plan([]);
    v2.state.draft.islandLevel = 6;
    v2.state.draft.slots = Array.from({ length: 16 }, (_, i) => ({ id: `R${i + 1}`, item: null }));
    const items = (await load('content/js/tools/island-planner-v2/items.js')).namespace;
    const candidates = items.itemRows().filter(items.isEconomicItem).flatMap(item => {
        const modes = items.animalProductionModes(item);
        return (modes.length ? modes.map(mode => mode.value) : [null]).flatMap(productionMode => {
            const result = v2.calculateIslandPlan({ entries: [{ id: 'trial', item: item.key, productionMode, focus: false }], update: false });
            return Number.isFinite(result.profiles[0]?.net) ? result.profiles : [];
        });
    });
    const started = performance.now();
    const { result, derived } = await v2.optimizeDraftPlacement(candidates);
    near(result.net, derived.summary.net, 'catalog total');
    assert.ok(result.entries.length <= 16);
    console.log(`catalog ${candidates.length} candidates, ${result.metadata.visited} nodes, ${Math.round(performance.now() - started)} ms`);
});
test('V2 candidate screening excludes missing data but keeps and reports stale quotes', () => {
    plan([], { baby: false });
    const entries = [{ id: 'trial', item: 'chicken', productionMode: 'grow' }, { id: 'trial', item: 'wheat' }];
    let screened = v2.evaluatePlacementCandidates(entries);
    assert.equal(screened.candidates.length, 1);
    assert.equal(screened.skipped, 1);
    assert.ok(screened.diagnostics.some(value => value.itemId === chicken.babyId));
    v2.state.priceIndex = market.indexPrices(priceRows().map(row => ({ ...row, buy_price_max_date: '2000-01-01T00:00:00Z', sell_price_min_date: '2000-01-01T00:00:00Z' })));
    screened = v2.evaluatePlacementCandidates(entries);
    assert.equal(screened.candidates.length, 2);
    assert.equal(screened.staleCandidates, 2);
    assert.ok(screened.diagnostics.some(value => value.type === 'stale-price'));
});
await placementTest('V2 validation rejects a mismatched optimizer economic profile', async () => {
    plan([]);
    v2.state.draft.slots = [{ id: 'R1', item: null }];
    const profile = v2.calculateIslandPlan({ entries: [{ id: 'trial', item: 'wheat' }], update: false }).profiles[0];
    await assert.rejects(v2.optimizeDraftPlacement([{ ...profile, net: profile.net + 100000 }]), /doğrulanamadı/);
    assert.equal(v2.state.draft.slots[0].item, null);
});
test('V2 catalog price screening catches invalid prices on unplaced candidates', () => {
    plan([]);
    v2.state.priceIndex = market.indexPrices(priceRows().map(row => row.item_id === chicken.grownId ? { ...row, buy_price_max: -1, sell_price_min: 0 } : row));
    const result = v2.evaluatePlacementCandidates(v2.optimizationEntries());
    assert.ok(result.diagnostics.some(value => value.itemId === chicken.grownId && value.type === 'missing-price'));
    assert.ok(result.skipped > 0);
    assert.equal(v2.state.draft.slots.length, 0);
});
test('V2 non-feeding crops contribute zero to market feed totals, not unknown', () => {
    const derived = plan(['wheat', 'chicken', 'chicken', 'chicken']);
    assert.equal(derived.slots.get('R1').market, 0);
    const animals = [...derived.slots.values()].slice(1);
    near(derived.summary.market, animals.reduce((sum, value) => sum + value.market, 0), 'market feed aggregate');
    near(derived.summary.feed, derived.summary.market + derived.summary.internal, 'actual total feed');
    near(derived.summary.surplus, [...derived.slots.values()].reduce((sum, value) => sum + value.netOutput, 0), 'all sellable output');
    assert.ok(derived.summary.market > 0);
    assert.equal(plan(['wheat']).summary.market, 0);
    assert.equal(plan(['wheat']).summary.feed, 0);
});
test('V2 pumpkin supplies cow feed when internal use is cheaper, otherwise sells it', () => {
    let derived = plan(['pumpkin', 'cow']);
    assert.ok(derived.summary.internal > 0, 'matching pumpkin is used by cow');
    near(derived.summary.internal, derived.slots.get('R2').internal, 'internal total');
    const pumpkin = economy.listCrops().find(item => item.key === 'pumpkin');
    v2.state.priceIndex = market.indexPrices(priceRows().map(row => row.item_id === pumpkin.plantId ? { ...row, sell_price_min: 10000, buy_price_max: 100 } : row));
    v2.state.draft.seedSide = 'buy';
    v2.state.draft.harvestSide = 'sell';
    derived = v2.calculateIslandPlan({ update: false });
    assert.equal(derived.summary.internal, 0, 'selling pumpkin and buying cheap feed is preferable');
    assert.ok(derived.slots.get('R2').market > 0);
    near(derived.slots.get('R1').netOutput, derived.slots.get('R1').output, 'pumpkin remains for sale');
});
test('V2 per-unit production cost uses full output and includes internal feed opportunity cost', () => {
    const derived = plan(['pumpkin', 'cow']);
    const crop = derived.slots.get('R1'), cow = derived.slots.get('R2');
    near(crop.unitCost, crop.expense / crop.output, 'pumpkin average cost');
    near(cow.unitCost, (cow.expense + cow.internalTransferIn) / cow.output, 'milk average cost');
    assert.ok(cow.internalTransferIn > 0);
    assert.ok(cow.unitCost > cow.expense / cow.output, 'internal feed is not free');
    plan(['chicken'], { baby: false });
    v2.state.draft.slots[0].productionMode = 'grow';
    const missing = v2.calculateIslandPlan({ update: false }).slots.get('R1');
    assert.equal(missing.unitCost, null, 'missing input cost must not become zero');
});
await placementTest('V2 Long Term UI and normal quote provider preserve tick, fees, feed and optimizer', async () => {
    plan(['wheat', 'chicken']);
    const prices = priceRows();
    v2.state.draft.seedSide = 'buy'; v2.state.draft.harvestSide = 'sell';
    const baseline = v2.calculateIslandPlan({ update: false });
    const settings = (await load('content/js/core/settings.js')).namespace;
    settings.saveSettings({ server: 'europe' });
    const server = settings.getServer().id;
    assert.equal(server, 'europe');
    const key = (await load('content/js/core/market-primitives.mjs')).namespace.marketSeriesKey;
    const references = prices.flatMap(row => ['buy', 'sell'].map(side => ({
        server, itemId: row.item_id, city: row.city, quality: 1, side,
        price: side === 'buy' ? row.buy_price_max : row.sell_price_min,
        source: 'quote-history', sources: ['aodp-current'], validDays: 1, validBuckets: 2,
        sourceQuoteAt: new Date(Date.now() - 86400000).toISOString()
    })));
    context.AbortSignal = { timeout: () => undefined };
    let hubReads = 0;
    context.fetch = async url => ({ ok: true, json: async () => {
        if (String(url).includes('/market/long-term?')) {
            const request = new URL(url);
            assert.equal(request.searchParams.get('server'), 'europe');
            assert.ok(!String(url).includes('undefined'));
            hubReads++; return { server, references };
        }
        return [];
    } });
    v2.state.draft.seedSide = 'long-term'; v2.state.draft.harvestSide = 'long-term';
    const fetched = await v2.fetchPlanPrices(economy.allPriceItemIds(), ['Fort Sterling']);
    assert.ok(hubReads > 0); assert.equal(fetched.longTerm.size, references.length);
    v2.state.priceIndex = null; v2.state.longTermPriceIndex = fetched.longTerm;
    const derived = v2.calculateIslandPlan({ update: false });
    near(derived.summary.net, baseline.summary.net, 'same economics from references');
    near(derived.slots.get('R1').purchaseQuote.tick, 1, 'buy order tick');
    near(derived.slots.get('R1').saleQuote.tick, -1, 'sell order tick');
    near(derived.slots.get('R2').internalTransferIn, baseline.slots.get('R2').internalTransferIn, 'shared feed opportunity cost');
    assert.ok(v2.renderPriceSegment('Tohum', 'long-term', false, 'seed').includes('data-v2-seed="long-term"'));
    assert.ok(v2.renderPriceSegment('Tohum', 'long-term', false, 'seed').includes('UV'));
    const metadata = (await load('content/js/core/long-term-quotes.js')).namespace.longTermMetadata;
    const partialQuote = { reference: { source: 'current-buy-fallback', validDays: 0, validBuckets: 0,
        dayCoverage: [{ day: '2026-10-07', status: 'partial-day', accepted: false, validBucketCount: 2,
            coverageRatio: 2 / 24, firstObservationAt: '2026-10-07T20:00:00Z',
            lastObservationAt: '2026-10-07T21:00:00Z', reasons: ['insufficient-buckets', 'insufficient-time-span'] }] } };
    assert.equal(metadata(partialQuote, { compact: true }), 'UV: geçmiş yetersiz, son alış fiyatı');
    assert.ok(metadata(partialQuote).includes('1 eksik gün emir ortalamasına alınmadı.'));
    assert.ok(metadata(partialQuote).includes('Geçmiş veri yetersiz; son bilinen alış fiyatı kullanıldı.'));
    assert.ok(!metadata(partialQuote).includes('insufficient-buckets'));
    v2.state.draft.focus = true;
    assert.ok(v2.optimizationEntries().some(entry => entry.focus === true), 'autofill includes focus');
    const settingsModule = await load('content/js/core/settings.js');
    settingsModule.namespace.saveSettings({ islandFocusBudget: 9000 });
    const occupied = v2.state.draft.slots[0];
    v2.state.draft.slots.push({ id: 'R3', item: null }, { id: 'R4', item: null, locked: true });
    const screened = v2.evaluatePlacementCandidates([{ id: 'trial', item: 'wheat', focus: false }]);
    const { result, next, derived: final } = await v2.optimizeDraftPlacement(screened.candidates);
    assert.equal(next[0], occupied); assert.equal(next[3].item, null);
    near(result.net, final.summary.net, 'long-term optimizer final common engine');
    near(result.marginalNet, final.summary.net - result.baseline, 'long-term total profit difference');
    v2.state.longTermPriceIndex = new Map(references.filter(ref => ref.itemId !== wheat.seedId).map(ref => [key(ref), ref]));
    assert.equal(v2.evaluatePlacementCandidates([{ id: 'trial', item: 'wheat' }]).candidates.length, 0, 'missing references exclude candidate');
});
const focusModule = await load('content/js/core/island/focus.js');
await focusModule.evaluate();
const focusEngine = focusModule.namespace;
const catalog = (await load('content/js/core/catalog.js')).namespace;
test('Focus resolver uses latest per-use observation across cities, never averages', () => {
    const row = { itemKey: wheat.key, itemType: 'plant', water: true, date: '2026-10-01', focusPerUse: 700, id: 1 };
    const rows = [row, { ...row, id: 2, date: '2026-10-08', islandCity: 'Lymhurst', focusPerUse: 420 },
        { ...row, id: 3, date: '2026-10-09', focusPerUse: null },
        { ...row, id: 4, date: '2026-10-09', water: false, focusPerUse: 10 },
        { ...row, id: 5, date: '2026-10-09', itemType: 'animalProduct', focusPerUse: 10 },
        { ...row, id: 6, date: '2026-10-09', focusPerUse: -2 }];
    const resolved = focusEngine.resolveFocus(wheat, rows);
    assert.equal(resolved.focusPerUse, 420);
    assert.equal(resolved.focusSource, 'observed');
    assert.equal(resolved.focusObservedAt, '2026-10-08');
    assert.equal(focusEngine.resolveFocus(wheat, []).focusSource, 'default');
    assert.equal(focusEngine.resolveFocus({ ...wheat, defaultFocusPerUse: null }, []).focusSource, 'unknown');
    assert.equal(focusEngine.resolveFocus({ ...wheat, defaultFocusPerUse: 333 }, []).focusPerUse, 333);
    assert.equal(focusEngine.resolveFocus(wheat, [...rows, { ...row, id: 7, date: '2026-10-08', focusPerUse: 400 }]).focusPerUse, 400);
});
test('Real catalog focus cycles 1–6 use actual capacity and common planning days', () => {
    const animals = catalog.getAnimals();
    for (let uses = 1; uses <= 6; uses++) {
        const animal = animals.find(item => item.maxNurtureCount === uses && item.plotType === 'pasture');
        assert.ok(animal, `catalog ${uses} uses`);
        const rows = [{ itemKey: animal.key, itemType: 'animal', water: true, date: '2026-10-09', focusPerUse: 420 }];
        const hours = config.planCycleHours(config.animalCycleHours(animal, true));
        const info = focusEngine.focusRequirement(animal, { focused: true, capacity: animal.pens, hours }, rows);
        near(info.cycleFocus, 420 * uses * animal.pens, animal.key);
        near(info.focusPerDay, info.cycleFocus / (hours / config.planDayHours()), 'planning normalization');
    }
    const ram = animals.find(item => item.key === 'faction-ram-t5');
    const example = focusEngine.focusRequirement(ram, { focused: true, capacity: ram.pens,
        hours: config.planCycleHours(config.animalCycleHours(ram, true)) }, [{ itemKey: ram.key, itemType: 'animal', water: true, date: '2026-10-09', focusPerUse: 420 }]);
    assert.equal(example.focusUsesPerCycle, 3); assert.equal(example.cycleFocus, 5040); assert.equal(example.focusPerDay, 1680);
    near(focusEngine.focusRequirement(wheat, { focused: true, capacity: 2, hours: config.planCycleHours(config.cropHours()) }, []).focusPerDay, 2000, 'crop actual capacity');
});
await placementTest('Focus additive migration is idempotent and preserves manual catalog data', async () => {
    const original = store.getAll('plants');
    const changed = original.map((row, i) => {
        if (i === 0) return { ...row, defaultFocusPerUse: 321, vendorSilver: 777 };
        if (i === 1) return { ...row, defaultFocusPerUse: null };
        const { defaultFocusPerUse, maxNurtureCount, ...legacy } = row; return legacy;
    });
    store.replaceAllRows('plants', changed);
    context.fetch = async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(url, 'utf8')) });
    await store.migrateFarmFocus();
    assert.equal(store.getAll('plants')[0].defaultFocusPerUse, 321);
    assert.equal(store.getAll('plants')[0].vendorSilver, 777);
    assert.equal(store.getAll('plants')[1].defaultFocusPerUse, null);
    assert.equal(store.getAll('plants')[2].defaultFocusPerUse, 1000);
    const once = JSON.stringify(store.getAll('plants')); await store.migrateFarmFocus();
    assert.equal(JSON.stringify(store.getAll('plants')), once);
    store.replaceAllRows('plants', original);
});
await placementTest('V2 optimizer accepts default focus and reacts to observed focus through shared economics', async () => {
    const settings = (await load('content/js/core/settings.js')).namespace;
    settings.saveSettings({ islandFocusBudget: 9000 });
    store.replaceAllRows('islandYieldLogs', []);
    plan([], { focus: true });
    v2.state.draft.slots = [{ id: 'R1' }, { id: 'R2' }];
    const entry = { id: 'trial', item: 'wheat', focus: true };
    let profile = v2.evaluatePlacementCandidates([entry]).candidates[0];
    assert.ok(profile); assert.equal(profile.focusSource, 'default'); assert.equal(profile.focusPerDay, 9000);
    let result = await v2.optimizeDraftPlacement([profile]);
    assert.equal(result.result.entries.length, 1); assert.equal(result.derived.summary.focus, 9000);
    store.replaceAllRows('islandYieldLogs', [{ id: 1, itemKey: wheat.key, itemType: 'plant', water: true, date: '2026-10-09', focusPerUse: 420 }]);
    profile = v2.evaluatePlacementCandidates([entry]).candidates[0];
    assert.equal(profile.focusSource, 'observed'); assert.equal(profile.focusPerDay, 3780);
    result = await v2.optimizeDraftPlacement([profile]);
    assert.equal(result.result.entries.length, 2); assert.equal(result.derived.summary.focus, 7560);
    v2.state.draft.slots = [entry]; v2.state.selectedSlotId = entry.id;
    v2.calculateIslandPlan({ update: true });
    assert.ok(v2.renderDetail().includes('ÖLÇÜLEN'));
    store.replaceAllRows('islandYieldLogs', []); v2.calculateIslandPlan();
    assert.ok(v2.renderDetail().includes('DEFAULT'));
    assert.ok(v2.renderSummary().includes('1 slot default'));
    assert.ok(v2.renderControls().includes('data-v2-focus-budget'));
});
test('Focus seed imports game metadata once and preserves manual values', () => {
    const rows = [...store.getAll('plants'), ...store.getAll('animals')];
    const byId = new Map(store.getAll('items').map(item => [item.id, item]));
    assert.equal(rows.length, 53);
    for (const row of rows) {
        const item = byId.get(row.seedItemId ?? row.babyItemId);
        assert.equal(row.defaultFocusPerUse, item.activeFarmFocusCost, row.key);
        assert.equal(row.maxNurtureCount, item.activeFarmMaxCycles, row.key);
    }
});
const { seedFarmFocus } = await import('./farm-focus-seed.mjs');
test('Focus seed fallback is seed-only; manual values survive repeat imports', () => {
    const rows = [{ id: 1, seedItemId: 1 }, { id: 2, seedItemId: 1, defaultFocusPerUse: 123 },
        { id: 3, seedItemId: 1, defaultFocusPerUse: null }];
    const once = seedFarmFocus(rows, [{ id: 1, activeFarmMaxCycles: 1 }], 'seedItemId');
    assert.equal(once[0].defaultFocusPerUse, 1000);
    assert.equal(once[1].defaultFocusPerUse, 123);
    assert.equal(once[2].defaultFocusPerUse, null);
    assert.deepEqual(seedFarmFocus(once, [{ id: 1, activeFarmFocusCost: 999, activeFarmMaxCycles: 1 }], 'seedItemId'), once);
});
await placementTest('V2 full 16-slot focused catalog honors budget and common engine totals', async () => {
    plan([], { focus: true });
    v2.state.draft.slots = Array.from({ length: 16 }, (_, i) => ({ id: `R${i + 1}` }));
    v2.state.longTermPriceIndex = new Map();
    const items = (await load('content/js/tools/island-planner-v2/items.js')).namespace;
    const quotes = items.itemRows().flatMap(item => [item.seedId, item.plantId, item.babyId, item.grownId, item.meatId, item.productId])
        .filter(Boolean).map(item_id => ({ item_id, city: 'Fort Sterling', quality: 1, sell_price_min: 1000, buy_price_max: 800,
            sell_price_min_date: new Date().toISOString(), buy_price_max_date: new Date().toISOString() }));
    v2.state.priceIndex = market.indexPrices(quotes);
    const candidates = v2.evaluatePlacementCandidates(v2.optimizationEntries()).candidates;
    assert.ok(candidates.some(profile => profile.focusSource === 'default' && profile.focusPerDay > 0));
    const result = await v2.optimizeDraftPlacement(candidates);
    assert.ok(result.derived.summary.focus <= 9000);
    near(result.result.net, result.derived.summary.net, 'focus complete plan total');
    assert.ok(result.result.entries.length <= 16);
});
await placementTest('V2 production ledger renders every catalog mode and the largest material recipe', async () => {
    plan([]);
    const items = (await load('content/js/tools/island-planner-v2/items.js')).namespace;
    let largest = null;
    for (const item of items.itemRows().filter(items.isEconomicItem)) {
        const modes = items.animalProductionModes(item);
        for (const productionMode of modes.length ? modes.map(mode => mode.value) : [null]) {
            for (const mountItem of productionMode === 'mount' ? items.mountRecipes(item).map(recipe => recipe.uniqueName) : [null]) {
                const entry = { id: 'R1', item: item.key, productionMode, mountItem, focus: false };
                v2.state.draft.slots = [entry];
                v2.state.selectedSlotId = 'R1';
                v2.state.hoveredSlotId = null;
                const result = v2.calculateIslandPlan();
                const value = result.slots.get('R1');
                const html = v2.renderDetail();
                const purchases = value.expenseLines.filter(line => line.kind === 'purchase');
                assert.equal((html.match(/<th scope="row">/g) ?? []).length, purchases.length + 1, item.key);
                if (purchases.some(line => line.unitPrice == null)) assert.ok(html.includes('<td>—</td>'), item.key);
                if (Number.isFinite(value.expense)) near(purchases.reduce((sum, line) => sum + line.total, 0), value.expense, item.key);
                assert.ok(html.includes('Net kâr / gün'));
                if (!largest || purchases.length > largest.count) largest = { item: item.key, mountItem, count: purchases.length };
            }
        }
    }
    assert.ok(largest.count >= 3);
    console.log('Largest production ledger:', JSON.stringify(largest));
});
console.log(`${checks} island economy checks passed.`);
