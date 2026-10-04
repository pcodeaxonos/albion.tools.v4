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
    if (file.endsWith(`${path.sep}island-planner-v2.js`)) code = code.replace(/init\(\);\s*$/, 'export { state, priceSummaryLabel };');
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


const items = (await load('content/js/tools/island-planner-v2/items.js')).namespace;
const catalog = (await load('content/js/core/catalog.js')).namespace;
const fees = (await load('content/js/core/market-fees.js')).namespace;
const rows = store.getAll('items').flatMap(item => ['Fort Sterling', 'Martlock'].map(city => ({ item_id: item.uniqueName, city, quality: 1, sell_price_min: 100, buy_price_max: 200 })));
v2.state.draft = { premium: true, focus: false, islandCity: 'Fort Sterling', sellCity: 'Martlock', seedSide: 'sell', harvestSide: 'buy', slots: [] };
v2.state.priceIndex = market.indexPrices(rows);
for (const animal of catalog.getAnimals().filter(item => ['mount', 'faction-mount'].includes(item.kind))) {
    const recipes = items.mountRecipes(animal);
    assert.ok(recipes.length, animal.key + ' mount recipes');
    assert.ok(items.animalProductionModes(animal).some(mode => mode.value === 'mount'));
    const live = v2.calculateIslandPlan({ entries: [{id: 'R1', item: animal.key, productionMode: 'live'}], update: false }).slots.get('R1');
    for (const recipe of recipes) {
        const entry = { id: 'R1', item: animal.key, productionMode: 'mount', mountItem: recipe.uniqueName };
        const mounted = v2.calculateIslandPlan({ entries: [entry], update: false }).slots.get('R1');
        near(mounted.output, live.output, 'growth unchanged');
        const materialQty = recipe.lines.filter(line => line.inputItemId !== animal.grownItemId).reduce((sum, line) => sum + line.qty * (/^T\d+_(LEATHER|PLANKS|METALBAR|CLOTH|STONEBLOCK)(?:@\d+)?$/.test(line.uniqueName) ? 0.848 : 1), 0);
        near(mounted.expense - live.expense, materialQty * 100 * mounted.output, 'conversion expense');
        near(mounted.net, mounted.income - mounted.expense, 'net includes conversion');
        assert.equal(mounted.saleQuote.price, 200);
        const missing = recipe.lines.find(line => line.inputItemId !== animal.grownItemId);
        if (missing) {
            v2.state.priceIndex = market.indexPrices(rows.filter(row => row.item_id !== missing.uniqueName));
            const blocked = v2.calculateIslandPlan({ entries: [entry], update: false }).slots.get('R1');
            assert.equal(blocked.expense, null);
            assert.equal(blocked.net, null);
            assert.ok(blocked.diagnostics.some(d => d.itemId === missing.uniqueName));
            v2.state.priceIndex = market.indexPrices(rows);
        }
    }
}
assert.equal(items.animalProductionModes(chicken).some(mode => mode.value === 'mount'), false);
const entries = v2.optimizationEntries();
for (const animal of catalog.getAnimals()) for (const recipe of items.mountRecipes(animal)) {
    const kennel = items.itemRows().find(item => item.key === animal.key)?.plotType === 'kennel';
    assert.equal(entries.some(entry => entry.item === animal.key && entry.mountItem === recipe.uniqueName), !kennel);
}
console.log('PASS all mount recipes, expenses, missing prices, and optimization variants');

for (const uniqueName of ['T5_LEATHER', 'T6_PLANKS', 'T7_METALBAR']) near(items.mountMaterialConsumption({ uniqueName, qty: 20 }).netQty, 16.96, 'refined RR');
for (const uniqueName of ['T5_FARM_HORSE_GROWN', 'T5_FACTION_TOKEN', 'T5_MOUNTUPGRADE_COUGAR_KEEPER']) near(items.mountMaterialConsumption({ uniqueName, qty: 20 }).netQty, 20, 'non-returnable input');
