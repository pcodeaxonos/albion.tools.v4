import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Real shared catalog/fee/quote code, without a browser or network.
const storage = new Map();
class Storage {
    getItem(key) { return storage.get(key) ?? null; }
    setItem(key, value) { storage.set(key, value); }
    removeItem(key) { storage.delete(key); }
}
const context = vm.createContext({ console, URL, URLSearchParams, Date, setTimeout, clearTimeout, Storage,
    localStorage: new Storage(), location: { search: '', pathname: '/' },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, dispatchEvent() {} }, CustomEvent: class {} });
const modules = new Map();
function moduleFor(file) {
    file = path.resolve(file);
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
}
async function load(file) {
    const module = moduleFor(file);
    if (module.status === 'unlinked') await module.link((specifier, parent) => moduleFor(path.resolve(path.dirname(parent.identifier), specifier)));
    if (module.status !== 'evaluated') await module.evaluate();
    return module.namespace;
}
const store = await load('content/js/db/store.js');
const schema = await load('content/js/db/schema.js');
for (const [name, table] of Object.entries(schema.tables)) if (table.seedUrl) store.replaceAllRows(name, JSON.parse(fs.readFileSync(table.seedUrl, 'utf8')));
const economics = await load('content/js/core/laborer/economics.js');
const planning = await load('content/js/core/laborer/planning.js');
const prices = await load('content/js/core/laborer/prices.js');
const dataModule = await load('content/js/core/laborer/data.js');
const { liquidity } = await load('content/js/core/laborer/liquidity.js');
const { indexPrices } = await load('content/js/core/market.js');
const fees = await load('content/js/core/market-fees.js');
const catalog = JSON.parse(fs.readFileSync('data/laborer-contract.json', 'utf8'));
catalog.mechanics = JSON.parse(fs.readFileSync('data/laborer-progression-rules.json', 'utf8'));
const rewardsModule = await load('content/js/core/laborer/rewards.js');
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plain = (value) => JSON.parse(JSON.stringify(value));

// Synthetic arithmetic fixtures are NOT Albion mechanic values. Production
// remains blocked by the real catalog's unverified mechanic manifest.
const mechanics = { verified: true, source: 'synthetic-test-only', cycleHours: 24, carryOver: true,
    stages: {
        2: { requiredFame: 100, journals: [{ filled: 'journal-a', fame: 60 }] },
        3: { requiredFame: 200, journals: [{ filled: 'journal-b', fame: 100 }] }
    } };
const cycle = { status: 'ok', gross: 50, rewardNet: 10, net: 40 };
const plan = (options = {}) => planning.planProgression({ mechanics, startTier: 2, targetTier: 3, journalEconomics: () => cycle, ...options });
const sale = (price, setup = false) => ({ item: 'contract', city: 'fixture', price, setup, status: 'ok', mode: 'manual' });
const evaluate = (options = {}) => economics.evaluatePlan({ plan: plan(), acquisition: 100, quantity: 1, sale: sale(500), premium: true, ...options });

test('production never calculates with unverified mechanics', () => {
    assert.equal(plan({ mechanics: catalog.mechanics }).status, 'unsupported');
    assert.ok(dataModule.mechanicIssues(catalog.mechanics).length);
});
test('contract and journal catalog joins existing item DB', () => {
    const items = new Set(JSON.parse(fs.readFileSync('data/items.json', 'utf8')).map((row) => row.uniqueName));
    assert.equal(dataModule.laborerTypes(catalog).length, 11);
    assert.equal(catalog.contracts.length, 77);
    for (const row of catalog.contracts) assert.ok(items.has(row.item));
    for (const row of catalog.journals) for (const item of [row.filled, row.empty].filter(Boolean)) assert.ok(items.has(item));
    for (const row of catalog.journals) for (const loot of row.loot) assert.ok(loot.item === 'SILVER' || items.has(loot.item), `${row.item}: ${loot.rawItem}`);
    assert.ok(catalog.provenance.itemsSha256);
});
test('mercenary silver and enchanted loot resolve actual AODP item names', () => {
    const mercenary = catalog.journals.find((journal) => journal.item === 'T4_JOURNAL_MERCENARY');
    assert.equal(mercenary.loot[0].item, 'SILVER'); assert.equal(mercenary.loot[0].amount, 1123);
    const wood = catalog.journals.find((journal) => journal.item === 'T4_JOURNAL_WOOD');
    assert.equal(wood.loot[1].item, 'T4_WOOD_LEVEL1@1');
});
test('observed returns are independent of progression and never infer empty return', () => {
    const journal = catalog.journals.find((journal) => journal.item === 'T2_JOURNAL_WOOD');
    assert.equal(rewardsModule.observedRewards(journal, {}).status, 'unknown');
    assert.equal(rewardsModule.observedRewards(journal, { T2_WOOD: 38 }).status, 'unknown');
    const result = rewardsModule.observedRewards(journal, { T2_WOOD: 38, T2_JOURNAL_WOOD_EMPTY: 0 });
    assert.equal(result.status, 'ok'); assert.equal(result.source, 'observed-manual');
    const valued = economics.cycleEconomics({ ...journal, rewardsVerified: true, rewards: result.rewards }, (item) => sale(item === journal.filled ? 100 : 2), true);
    near(valued.rewardNet, 38 * 2 * (1 - fees.taxPremiumRate())); near(valued.net, 100 - valued.rewardNet);
    assert.equal(rewardsModule.observedRewards(journal, { T2_WOOD: -1, T2_JOURNAL_WOOD_EMPTY: 0 }).status, 'unknown');
});
test('deterministic two cycle progression and carry-over', () => {
    const result = plan();
    assert.equal(result.status, 'ok'); assert.equal(result.sequence.length, 2);
    assert.deepEqual(plain(result.end), { tier: 3, progress: 20 }); near(result.hours, 48);
});
test('target T4 accounts for carried fame', () => {
    const result = plan({ targetTier: 4 });
    assert.equal(result.sequence.length, 4); assert.deepEqual(plain(result.end), { tier: 4, progress: 20 });
});
test('different starting tier and partial progress', () => {
    assert.equal(plan({ startTier: 3, progress: 100, targetTier: 4 }).sequence.length, 1);
    assert.equal(plan({ progress: 50 }).sequence.length, 1);
    assert.equal(plan({ progress: -1 }).status, 'unsupported');
    assert.equal(plan({ progress: 100 }).status, 'unsupported');
});
test('verified no carry-over drops excess', () => {
    assert.equal(plan({ mechanics: { ...mechanics, carryOver: false } }).end.progress, 0);
});
test('manual selection overrides automatic exact cost optimum', () => {
    const choices = { ...mechanics, stages: { ...mechanics.stages, 2: { requiredFame: 100,
        journals: [{ filled: 'cheap', fame: 50 }, { filled: 'fast', fame: 100 }] } } };
    const journalEconomics = (journal) => ({ ...cycle, net: journal.filled === 'cheap' ? 10 : 30 });
    const automatic = plan({ mechanics: choices, journalEconomics });
    assert.equal(automatic.sequence[0].journal, 'cheap'); near(automatic.cost, 20);
    const manual = plan({ mechanics: choices, journalEconomics, manual: { 2: 'fast' } });
    assert.equal(manual.sequence[0].journal, 'fast'); near(manual.cost, 30);
});
test('missing alternative prevents an unsupported optimum claim', () => {
    const choices = { ...mechanics, stages: { 2: { requiredFame: 100, journals: [{ filled: 'a', fame: 100 }, { filled: 'b', fame: 100 }] } } };
    assert.equal(plan({ mechanics: choices, journalEconomics: (journal) => journal.filled === 'b' ? { status: 'unknown', issues: ['missing b'] } : cycle }).status, 'unknown');
});
test('one laborer hand fixture gross 100 reward 20 profit 300', () => {
    const result = evaluate();
    near(result.grossJournalCost, 100); near(result.rewardNet, 20); near(result.levelingCost, 180);
    near(result.contractNet, 480); near(result.profit, 300); near(result.profitDay, 150); near(result.profitSlotDay, 150);
    near(result.roi, 300 / 180); near(result.initialCapital, 150); near(result.peakCapital, 190);
});
test('quantity scales money and journals, preserves elapsed days and slot efficiency', () => {
    const one = evaluate(), many = evaluate({ quantity: 30 });
    for (const key of ['grossJournalCost', 'rewardNet', 'levelingCost', 'profit', 'contractNet', 'initialCapital', 'peakCapital', 'journals']) near(many[key], one[key] * 30);
    near(many.days, one.days); near(many.profitSlotDay, one.profitSlotDay); near(many.roi, one.roi);
});
test('sale order uses shared premium tax and setup', () => {
    const result = evaluate({ sale: sale(500, true) });
    near(result.contractNet, fees.saleProceeds(500, { premium: true, setup: true }));
    near(result.profit, 500 * (1 - fees.taxPremiumRate() - fees.setupFeeRate()) - 180);
});
test('free account tax is shared', () => near(evaluate({ premium: false }).contractNet, fees.saleProceeds(500, { premium: false, setup: false })));
test('reward values and buy fees resolve from real shared functions', () => {
    const result = economics.cycleEconomics({ filled: 'full', rewardsVerified: true, rewards: [{ item: 'empty', quantity: 1 }, { item: 'reward', quantity: 2 }, { item: 'SILVER', quantity: 5 }] }, (item) => sale(item === 'full' ? 50 : 10, true), true);
    near(result.gross, fees.purchaseCost(50, { setup: true }));
    near(result.rewardNet, fees.saleProceeds(30, { premium: true, setup: true }) + 5);
    assert.equal(economics.cycleEconomics({ filled: 'full' }, () => sale(50), true).status, 'unknown');
});
test('missing or stale reward never becomes zero', () => {
    for (const status of ['missing', 'stale']) assert.equal(economics.cycleEconomics({ filled: 'full', rewardsVerified: true, rewards: [{ item: 'reward', quantity: 1 }] }, (item) => item === 'full' ? sale(50) : { ...sale(10), status }, true).status, 'unknown');
});
test('owned laborer has zero cash acquisition but sell-now opportunity cost', () => {
    near(evaluate({ acquisition: 0 }).levelingCost, 80);
    const result = economics.compareContinue({ plan: plan(), currentSale: sale(200), nextSale: sale(500), quantity: 1, premium: true });
    near(result.opportunityCost, 192); near(result.additionalProfit, 208); near(result.additionalProfitDay, 104);
    assert.equal(result.marginalBreakEven, 284);
});
test('continuation can be a loss and scales by quantity', () => {
    const result = economics.compareContinue({ plan: plan(), currentSale: sale(500), nextSale: sale(500), quantity: 30, premium: true });
    near(result.additionalProfit, -80 * 30); near(result.opportunityCost, 480 * 30);
});
test('break-even rounds up, first price covering fee-adjusted cost', () => {
    const result = economics.breakEven(180, { premium: true, setup: false });
    assert.equal(result, 188); assert.ok(fees.saleProceeds(result, { premium: true, setup: false }) >= 180);
    assert.ok(fees.saleProceeds(result - 1, { premium: true, setup: false }) < 180);
});
test('setup stays separate and impacts capital', () => {
    const result = evaluate({ setupCost: 1000 }); near(result.profit, 300); near(result.profitAfterSetup, -700); near(result.initialCapital, 1150);
    assert.equal(evaluate({ setupCost: null }).status, 'unknown');
});
test('invalid inputs never produce meaningful results', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) assert.equal(evaluate({ quantity: count }).status, 'unknown');
    for (const status of ['missing', 'stale', 'invalid']) assert.equal(evaluate({ sale: { ...sale(500), status } }).status, 'unknown');
    assert.equal(evaluate({ acquisition: null }).status, 'unknown');
    assert.equal(evaluate({ acquisition: -1 }).status, 'unknown');
});
test('numeric overflow and undefined rates remain unavailable', () => {
    assert.equal(evaluate({ quantity: 30, sale: sale(1e308) }).status, 'unknown');
    assert.equal(economics.netSale(sale(1e308), 30, true), null);
    assert.equal(economics.breakEven(Number.MAX_VALUE, { premium: true, setup: false }), null);
    const noCost = evaluate({ acquisition: 0, plan: { status: 'ok', cost: 0, sequence: [], hours: 0 } });
    assert.equal(noCost.roi, null); assert.equal(noCost.profitDay, null);
});
test('quote modes, freshness, side tick and manual reset', () => {
    const now = Date.now();
    const index = indexPrices([{ item_id: 'contract', city: 'fixture', quality: 1, sell_price_min: 500, sell_price_min_date: new Date(now).toISOString() }]);
    const args = { index, item: 'contract', city: 'fixture', side: 'sell', intent: 'sell', now };
    const live = prices.resolvePrice(args); assert.equal(live.price, 499); assert.equal(live.status, 'ok');
    const manual = prices.resolvePrice({ ...args, override: '600' }); assert.equal(manual.mode, 'manual'); assert.equal(manual.price, 600);
    assert.equal(prices.resolvePrice({ ...args, override: '' }).price, live.price);
    assert.equal(prices.resolvePrice({ ...args, override: '0' }).status, 'invalid');
    assert.equal(prices.resolvePrice({ ...args, now: now + 86400000 }).status, 'stale');
    assert.equal(prices.resolvePrice({ ...args, item: 'missing' }).status, 'missing');
});
test('timestamp unknown and future are untrusted', () => {
    for (const date of [null, '0001-01-01T00:00:00', 'bad', new Date(Date.now() + 86400000).toISOString()]) {
        const index = indexPrices([{ item_id: 'c', city: 'fixture', sell_price_min: 500, sell_price_min_date: date }]);
        assert.equal(prices.resolvePrice({ index, item: 'c', city: 'fixture', side: 'sell', intent: 'sell' }).status, 'stale');
    }
});
test('manual keys isolate servers, cities, sides and intent', () => {
    const keys = new Set([prices.overrideKey('east', 'c', 'a', 'sell', 'sell'), prices.overrideKey('west', 'c', 'a', 'sell', 'sell'), prices.overrideKey('east', 'c', 'b', 'sell', 'sell'), prices.overrideKey('east', 'c', 'a', 'buy', 'sell'), prices.overrideKey('east', 'c', 'a', 'sell', 'buy')]);
    assert.equal(keys.size, 5);
});
test('liquidity never invents volume and compares production quantity', () => {
    assert.equal(liquidity(null, 30).status, 'unknown');
    assert.equal(liquidity({ n: 14, avgItemCount: 2 }, 30).status, 'low');
    assert.equal(liquidity({ n: 14, avgItemCount: 100 }, 30).status, 'observed');
});
test('total profit and time efficiency may select different tiers', () => {
    const rows = [{ tier: 3, economics: { status: 'ok', profit: 100, profitSlotDay: 100 } }, { tier: 4, economics: { status: 'ok', profit: 200, profitSlotDay: 50 } }, { tier: 5, economics: { status: 'unknown', profit: 999 } }];
    assert.equal(economics.optimum(rows).total.tier, 4); assert.equal(economics.optimum(rows).efficiency.tier, 3);
    assert.equal(economics.optimum([]).total, null);
});
console.log(`OK ${checks} laborer calculation checks (synthetic mechanics; production verification gate enforced)`);
