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
const { progressionRules } = await load('content/js/core/laborer/progression-rules.js');
const acquisitionModule = await load('content/js/core/laborer/acquisition.mjs');
const { parseLaborerXml, mechanicsFromLaborers, acquisitionFromMechanics } = await import('./laborer-mechanics.mjs');
const xmlFixture = fs.readFileSync('content/scripts/fixtures/laborer-buildings.xml', 'utf8');
const { liquidity } = await load('content/js/core/laborer/liquidity.js');
const { indexPrices } = await load('content/js/core/market.js');
const fees = await load('content/js/core/market-fees.js');
const catalog = JSON.parse(fs.readFileSync('data/laborer-contract.json', 'utf8'));
catalog.mechanics = JSON.parse(fs.readFileSync('data/laborer-progression-rules.json', 'utf8'));
catalog.acquisition = JSON.parse(fs.readFileSync('data/laborer-acquisition.json', 'utf8'));
const rewardsModule = await load('content/js/core/laborer/rewards.js');
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plain = (value) => JSON.parse(JSON.stringify(value));

// Synthetic arithmetic fixtures are NOT Albion mechanic values. Production
// remain isolated from the parsed production mechanics.
const mechanics = { verified: true, source: 'synthetic-test-only', cycleHours: 24, carryOver: true,
    stages: {
        2: { requiredFame: 100, journals: [{ filled: 'journal-a', fame: 60 }] },
        3: { requiredFame: 200, journals: [{ filled: 'journal-b', fame: 100 }] }
    } };
const cycle = { status: 'ok', gross: 50, rewardNet: 10, net: 40 };
const plan = (options = {}) => planning.planProgression({ mechanics, startTier: 2, targetTier: 3, journalEconomics: () => cycle, ...options });
const sale = (price, setup = false) => ({ item: 'contract', city: 'fixture', price, setup, status: 'ok', mode: 'manual' });
const evaluate = (options = {}) => economics.evaluatePlan({ plan: plan(), acquisition: 100, quantity: 1, sale: sale(500), premium: true, ...options });

test('all null prices retain Fletcher mechanical routes and acquisition-only capital', () => {
    const rules = progressionRules(catalog, 'hunter');
    assert.equal(rules.stages[2].requiredFame, 75);
    assert.equal(rules.stages[2].accepted.length, 2);
    const journal = rules.stages[2].journals.find((row) => row.filled === 'T2_JOURNAL_HUNTER_FULL');
    assert.equal(journal.fame, 76);
    const missingQuote = (item, intent) => ({ item, intent, status: 'missing', price: null });
    for (let targetTier = 3; targetTier <= 8; targetTier++) {
        const options = { mechanics: rules, startTier: 2, targetTier };
        const result = planning.planProgression({ ...options, journalEconomics: (row) => economics.cycleEconomics(row, missingQuote, true) });
        assert.equal(result.reachable, true);
        assert.equal(result.economicAvailable, false);
        assert.ok(result.cycles > 0 && result.planningDays > 0 && result.mechanicalHours > 0);
        assert.equal(result.sequence[0].journal, journal.filled);
        if (targetTier === 3) { assert.equal(result.cycles, 1); assert.equal(result.mechanicalHours, 22); }
        const values = economics.evaluatePlan({ plan: result, acquisition: 1000, quantity: 1, sale: missingQuote('contract', 'sell'), premium: true });
        assert.equal(values.cycles, result.cycles);
        assert.equal(values.profit, null);
        assert.equal(values.roi, null);
        assert.equal(values.peakCapital, null);
        assert.equal(values.acquisitionCapital, 1000);
        const priced = planning.planProgression({ ...options, journalEconomics: () => cycle });
        assert.deepEqual(plain(priced.mechanical), plain(result.mechanical));
        assert.equal(priced.economicAvailable, true);
        const pricedValues = economics.evaluatePlan({ plan: priced, acquisition: 1000, quantity: 1, sale: sale(5000), premium: true });
        assert.ok(Number.isFinite(pricedValues.profit));
    }
});

test('NPC hire costs 1000 for one laborer and 10000 for ten', () => {
    assert.equal(acquisitionModule.hireCost(catalog, 'wood', 1), 1000);
    assert.equal(acquisitionModule.hireCost(catalog, 'wood', 10), 10000);
    for (const premium of [true, false]) {
        for (const quantity of [1, 10]) {
            const result = evaluate({ acquisition: acquisitionModule.hireCost(catalog, 'wood'), quantity, premium });
            near(result.levelingCost - result.grossJournalCost + result.rewardNet, 1000 * quantity);
        }
    }
});
test('NPC acquisition starts at T2 regardless of selected or persisted tier', () => {
    for (const startTier of [2, 4, 8]) {
        assert.equal(acquisitionModule.acquisitionStartTier(catalog, { type: 'wood', acquisitionMode: 'new', startTier }), 2);
        assert.equal(acquisitionModule.acquisitionStartTier(catalog, { type: 'wood', acquisitionMode: 'market', startTier }), startTier);
    }
});
test('current XML fixture imports all 77 laborers and joins contracts/journals', () => {
    const rows = parseLaborerXml(xmlFixture);
    assert.equal(rows.length, 77);
    const parsed = mechanicsFromLaborers(rows, catalog.contracts, catalog.journals, { source: 'fixture' });
    assert.deepEqual(parsed.byType, catalog.mechanics.byType);
    const hire = acquisitionFromMechanics(parsed);
    assert.equal(hire.tier, 2); assert.equal(hire.cost, 1000);
    assert.throws(() => parseLaborerXml('<buildings/>'));
    assert.throws(() => parseLaborerXml(xmlFixture.replace('fametoprogress="75"', 'fametoprogress="bad"')));
});
test('XML Fletcher thresholds, job length and exact acceptance are authoritative', () => {
    const rules = progressionRules(catalog, 'hunter');
    assert.deepEqual(Object.values(rules.stages).map(stage => stage.requiredFame), [75, 360, 1200, 4320, 12480, 36480, 0]);
    for (const tier of [2, 3, 4, 5]) {
        assert.ok(rules.stages[5].accepted.includes(`T${tier}_JOURNAL_HUNTER_FULL`));
        assert.ok(rules.stages[5].accepted.includes(`T${tier}_JOURNAL_TROPHY_GENERAL_FULL`));
    }
    assert.ok(!rules.stages[5].accepted.includes('T6_JOURNAL_HUNTER_FULL'));
    assert.equal(rules.stages[2].hirePrice, 1000);
    assert.equal(rules.stages[2].jobLengthSeconds, 79200);
    assert.equal(rules.cycleHours, 22);
    assert.equal(rules.carryOver, true);
    assert.deepEqual(plain(dataModule.mechanicIssues(rules)), []);
    assert.equal(planning.applyCycle({ tier: 5, progress: 0 }, { filled: 'T6_JOURNAL_HUNTER_FULL', fame: 1000 }, rules), null);
});
test('XML profile thresholds retain regression totals without runtime hardcodes', () => {
    for (const [type, values, total] of [
        ['wood', [75,360,1200,4320,12480,36480,0], 54915],
        ['fish', [76,393,1255,4374,12519,36537,0], 55154],
        ['mercenary', [282,1302,3265,7866,15223,30286,0], 58224]
    ]) {
        const actual = Object.values(progressionRules(catalog, type).stages).map(stage => stage.requiredFame);
        assert.deepEqual(actual, values);
        assert.equal(actual.reduce((a,b)=>a+b,0),total);
    }
    assert.equal(catalog.mechanics.profiles, undefined);
    assert.equal(catalog.mechanics.behavior.source, 'verified-behavior');
    assert.equal(catalog.mechanics.behavior.confidence, 'behavioral/high');
});
test('weighted loot and progression share one return-yield resolver', () => {
    const journal = catalog.journals.find(j => j.item === 'T2_JOURNAL_HUNTER');
    const baseline = rewardsModule.resolveRewards(journal);
    const more = rewardsModule.resolveRewards(journal, { returnYield: 1.5 });
    const less = rewardsModule.resolveRewards(journal, { returnYield: .5 });
    const zero = rewardsModule.resolveRewards(journal, { returnYield: 0 });
    assert.equal(baseline.status, 'ok'); near(baseline.expectedLabourerFame, 76);
    near(more.expectedLabourerFame, baseline.expectedLabourerFame * 1.5);
    near(less.expectedLabourerFame, baseline.expectedLabourerFame * .5);
    near(zero.expectedLabourerFame, 0);
    for (let i = 0; i < baseline.expectedLoot.length; i++) near(more.expectedLoot[i].quantity, baseline.expectedLoot[i].quantity * 1.5);
    assert.equal(baseline.rewards.some(r=>r.item===journal.empty), false);
    assert.equal(rewardsModule.resolveRewards({ ...journal, emptyReturnVerified: true }).rewards.find(r=>r.item===journal.empty).quantity, 1);
    const changed = rewardsModule.resolveRewards({ ...journal, fillFame: 999999999 });
    near(changed.expectedLabourerFame, baseline.expectedLabourerFame);
    const valued = economics.cycleEconomics({ ...journal, ...baseline, rewardsVerified: true }, (item)=>sale(item===journal.filled?100:2),true);
    near(valued.expectedLabourerFame, baseline.expectedLabourerFame);
    near(valued.expectedRewardValue, 38*2*(1-fees.taxPremiumRate()));
});
test('mixed fame entries and silver payouts never sum fame blindly or grant fame per coin', () => {
    const journal = { filled:'full', empty:'empty', baseLootAmount:4, loot:[
        {item:'a',amount:1,weight:1,labourerFame:2}, {item:'b',amount:1,weight:3,labourerFame:10}
    ] };
    const resolved = rewardsModule.resolveRewards(journal);
    near(resolved.expectedLabourerFame,32);
    const mercenary = catalog.journals.find(j=>j.item==='T3_JOURNAL_MERCENARY');
    const silver = rewardsModule.resolveRewards(mercenary);
    near(silver.expectedLabourerFame, mercenary.loot[0].labourerFame);
    near(silver.rewards.find(r=>r.item==='SILVER').quantity,mercenary.loot[0].amount);
});
test('fractional expected fame works and carry-over permits one advance per job', () => {
    const rules = progressionRules(catalog,'hunter');
    const journal = rules.stages[2].journals.find(j=>j.filled==='T2_JOURNAL_HUNTER_FULL');
    assert.deepEqual(plain(planning.applyCycle({tier:2,progress:0},journal,rules)),{tier:3,progress:1});
    assert.deepEqual(plain(planning.applyCycle({tier:3,progress:1},{filled:'T3_JOURNAL_HUNTER_FULL',fame:0},rules)),{tier:3,progress:1});
    const fractional = { ...journal, fame:37.5 };
    assert.equal(planning.applyCycle({tier:2,progress:0},fractional,rules).progress,37.5);
    const huge = planning.applyCycle({tier:2,progress:0},{...journal,fame:10000},rules);
    assert.equal(huge.tier,3); assert.equal(huge.progress,9925);
});
test('planner rechecks next-tier journal acceptance after carry-over', () => {
    const rules = { ...mechanics, stages: {
        2:{requiredFame:10,accepted:['a'],journals:[{filled:'a',fame:11}]},
        3:{requiredFame:20,accepted:['b'],journals:[{filled:'b',fame:20}]},
        4:{requiredFame:0,accepted:[],journals:[]}
    } };
    const result = plan({mechanics:rules,targetTier:4});
    assert.deepEqual(plain(result.sequence.map(c=>c.journal)),['a','b']);
    assert.deepEqual(plain(result.end),{tier:4,progress:1});
});
test('production baseline progression runs from parsed XML at 22 real hours per job', () => {
    for (const type of dataModule.laborerTypes(catalog)) {
        const rules = progressionRules(catalog,type.type);
        const result = plan({mechanics:rules});
        assert.equal(result.status,'ok', type.type);
        assert.equal(result.sequence.length,1);
        assert.equal(result.actualHours,22);
        assert.equal(result.hours,24);
    }
});

test('T8 zero threshold never progresses to T9', () => {
    const rules = { ...mechanics, stages: { 7: { requiredFame: 10 }, 8: { requiredFame: 0 } } };
    assert.deepEqual(plain(planning.applyCycle({ tier: 7, progress: 0 }, { fame: 15 }, rules)), { tier: 8, progress: 5 });
    assert.equal(planning.applyCycle({ tier: 8, progress: 0 }, { fame: 15 }, rules), null);
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
test('22-hour jobs count as one full planning day per cycle', () => {
    const dailyMechanics = { ...mechanics, cycleHours: 22 };
    const single = plan({ mechanics: dailyMechanics, progress: 40 });
    assert.equal(single.sequence.length, 1);
    assert.equal(single.hours, 24);
    const multiple = plan({ mechanics: dailyMechanics, targetTier: 4 });
    assert.equal(multiple.hours, multiple.sequence.length * 24);
    near(evaluate({ plan: multiple }).days, multiple.sequence.length);
    assert.equal(dailyMechanics.cycleHours, 22);
});
test('target T4 accounts for carried fame', () => {
    const result = plan({ targetTier: 4 });
    assert.equal(result.sequence.length, 4); assert.deepEqual(plain(result.end), { tier: 4, progress: 20 });
});
test('different starting tier and partial progress', () => {
    assert.equal(plan({ startTier: 3, progress: 100, targetTier: 4 }).sequence.length, 1);
    assert.equal(plan({ progress: 50 }).sequence.length, 1);
    assert.equal(plan({ progress: -1 }).status, 'unsupported');
    assert.equal(plan({ progress: 100 }).sequence.length, 1);
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
    const result = plan({ mechanics: choices, journalEconomics: (journal) => journal.filled === 'b' ? { status: 'unknown', issues: ['missing b'] } : cycle });
    assert.equal(result.status, 'ok'); assert.equal(result.optimal, false); assert.ok(result.issues.includes('missing b'));
});
test('missing contract sale preserves costs, cycles, capital and planning time', () => {
    const result = evaluate({ sale: { ...sale(500), price: null, status: 'missing' } });
    assert.equal(result.status, 'partial');
    near(result.cycles, 2); near(result.days, 2); near(result.grossJournalCost, 100);
    near(result.levelingCost, 180); near(result.initialCapital, 150);
    assert.equal(result.profit, null); assert.equal(result.contractNet, null);
    assert.ok(result.breakEven > 0);
});
test('baseline T2 to T8 route remains available across all professions', () => {
    for (const type of dataModule.laborerTypes(catalog)) {
        const rules = progressionRules(catalog, type.type);
        const result = plan({ mechanics: rules, targetTier: 8 });
        assert.equal(result.status, 'ok', type.type);
        assert.ok(result.sequence.length >= 6);
        assert.equal(result.end.tier, 8);
        assert.ok(result.sequence.every(cycle => cycle.to.tier - cycle.from.tier <= 1));
    }
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
    assert.equal(evaluate({ setupCost: null }).status, 'partial');
});
test('invalid inputs never produce meaningful results', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) assert.equal(evaluate({ quantity: count }).status, 'unknown');
    for (const status of ['missing', 'stale', 'invalid']) assert.equal(evaluate({ sale: { ...sale(500), status } }).status, 'partial');
    assert.equal(evaluate({ acquisition: null }).status, 'partial');
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
test('selected route counts two blocking prices independently of twenty missing alternatives', () => {
    const missing = (item, intent = 'buy') => ({ item, city: 'Martlock', side: intent === 'buy' ? 'buy' : 'sell', intent, status: 'missing', price: null });
    const selectedJournal = { filled: 'chosen', type: 'fixture', tier: 2, fame: 100, rewardsVerified: true, rewards: [{ item: 'chosen-reward', quantity: 1 }] };
    const alternatives = Array.from({ length: 20 }, (_, i) => ({ filled: `alternative-${i}`, fame: 100, rewardsVerified: true, rewards: [] }));
    const rules = { ...mechanics, profession: 'fixture', stages: { 2: { requiredFame: 100, journals: [selectedJournal, ...alternatives] } } };
    const result = planning.planProgression({ mechanics: rules, startTier: 2, targetTier: 3, journalEconomics: journal => economics.cycleEconomics(journal, missing, true) });
    assert.equal(result.sequence[0].journal, 'chosen');
    assert.ok(result.issues.filter(issue => issue.includes('alternative-')).length >= 20);
    const targetSale = { ...sale(22000, true), side: 'sell', intent: 'sell' };
    const state = economics.economicPriceState({ plan: result, sale: targetSale });
    assert.equal(state.missing.length, 2);
    assert.deepEqual(plain(state.missing.map(quote => quote.item)), ['chosen', 'chosen-reward']);
    assert.equal(`${state.missing.length} fiyat eksik`, '2 fiyat eksik');
    const values = economics.evaluatePlan({ plan: result, acquisition: 1000, quantity: 1, sale: targetSale, premium: true });
    near(values.contractNet, 22000 * .935);
    assert.equal(values.cycles, 1);
    assert.equal(values.journals, 1);
    assert.equal(values.days, 1);
    for (const field of ['profit', 'levelingCost', 'profitSlotDay', 'roi', 'initialCapital', 'peakCapital', 'breakEven']) assert.equal(values[field], null);
});

test('missing journal manual override opens economics and reset isolates the exact market key', () => {
    const rules = progressionRules(catalog, 'hunter');
    const journal = rules.stages[2].journals.find(row => row.filled === 'T2_JOURNAL_HUNTER_FULL');
    const stamp = new Date().toISOString();
    const index = indexPrices([...journal.rewards.map(row => row.item), 'T3_LABOURER_CONTRACT_HUNTER'].map(item_id =>
        ({ item_id, city: 'Martlock', quality: 1, sell_price_min: 100, sell_price_min_date: stamp })));
    const overrides = {};
    const quote = (item, intent, city = 'Martlock', side = intent === 'buy' ? 'buy' : 'sell') => prices.resolvePrice({ index, item, city, side, intent,
        override: overrides[prices.overrideKey('europe', item, city, side, intent)] });
    const run = () => {
        const plan = planning.planProgression({ mechanics: rules, startTier: 2, targetTier: 3, journalEconomics: row => economics.cycleEconomics(row, quote, true) });
        const sale = quote('T3_LABOURER_CONTRACT_HUNTER', 'sell');
        return { plan, values: economics.evaluatePlan({ plan, acquisition: 1000, quantity: 1, sale, premium: true }), state: economics.economicPriceState({ plan, sale }) };
    };
    const missing = run();
    assert.equal(missing.plan.cycles, 1);
    assert.equal(missing.values.profit, null);
    assert.equal(missing.state.status, 'MISSING');
    assert.equal(missing.state.missing.length, 1);
    assert.equal(missing.state.missing[0].item, journal.filled);
    const key = prices.overrideKey('europe', journal.filled, 'Martlock', 'buy', 'buy');
    overrides[key] = '8400';
    const manual = run();
    assert.equal(manual.plan.economicAvailable, true);
    assert.equal(manual.state.status, 'MANUAL');
    assert.equal(manual.state.missing.length, 0);
    assert.ok(Number.isFinite(manual.values.profit) && Number.isFinite(manual.values.breakEven));
    assert.deepEqual(plain(manual.plan.mechanical), plain(missing.plan.mechanical));
    assert.equal(quote(journal.filled, 'buy', 'Fort Sterling').status, 'missing');
    assert.equal(quote(journal.filled, 'buy', 'Martlock', 'sell').status, 'missing');
    delete overrides[key];
    assert.equal(run().values.profit, null);
    assert.equal(run().state.status, 'MISSING');
    const general = rules.stages[2].journals.find(row => row.filled.includes('_TROPHY_GENERAL_'));
    const alternative = planning.planProgression({ mechanics: rules, startTier: 2, targetTier: 3,
        journalEconomics: row => row.filled === general.filled ? cycle : economics.cycleEconomics(row, quote, true) });
    assert.equal(alternative.economicAvailable, true);
    assert.equal(alternative.sequence[0].journal, general.filled);
});

test('Fletcher T2 economic trace uses shared book semantics and preserves partial prices', () => {
    const rules = progressionRules(catalog, 'hunter');
    const journal = rules.stages[2].journals.find(row => row.filled === 'T2_JOURNAL_HUNTER_FULL');
    const target = 'T3_LABOURER_CONTRACT_HUNTER';
    const ids = [journal.filled, ...journal.rewards.map(row => row.item), target];
    const stamp = new Date().toISOString();
    const rows = ids.map(item_id => ({ item_id, city: 'Martlock', quality: 1,
        buy_price_max: item_id === journal.filled ? 8400 : 10,
        sell_price_min: item_id === target ? 22000 : 50,
        buy_price_max_date: stamp, sell_price_min_date: stamp }));
    const run = (input) => {
        const index = indexPrices(input);
        const quote = (item, intent) => prices.resolvePrice({ index, item, city: 'Martlock', side: intent === 'buy' ? 'buy' : 'sell', intent });
        const route = planning.planProgression({ mechanics: rules, startTier: 2, targetTier: 3,
            manual: { 2: journal.filled }, journalEconomics: row => economics.cycleEconomics(row, quote, true) });
        return { route, cycle: economics.cycleEconomics(journal, quote, true),
            values: economics.evaluatePlan({ plan: route, acquisition: 1000, quantity: 1, sale: quote(target, 'sell'), premium: true }), quote };
    };
    const complete = run(rows);
    assert.equal(complete.quote(journal.filled, 'buy').field, 'buy_price_max');
    assert.equal(complete.quote(journal.filled, 'buy').price, 8401);
    assert.equal(complete.quote(target, 'sell').field, 'sell_price_min');
    const utcWithoutSuffix = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '');
    const utc = run(rows.map(row => ({ ...row, buy_price_max_date: utcWithoutSuffix, sell_price_min_date: utcWithoutSuffix })));
    assert.equal(utc.quote(journal.filled, 'buy').status, 'ok');
    assert.equal(utc.quote(journal.filled, 'buy').date, `${utcWithoutSuffix}Z`);
    const index = indexPrices(rows);
    assert.equal(prices.resolvePrice({ index, item: journal.filled, city: 'Martlock', side: 'sell', intent: 'buy' }).price, 50);
    assert.equal(prices.resolvePrice({ index, item: target, city: 'Martlock', side: 'buy', intent: 'sell' }).price, 10);
    assert.ok(complete.cycle.gross > 0 && complete.cycle.rewardNet >= 0);
    assert.ok(Number.isFinite(complete.values.levelingCost) && Number.isFinite(complete.values.profitDay));
    for (const missing of [journal.filled, journal.rewards[0].item, target]) {
        const result = run(rows.filter(row => row.item_id !== missing));
        assert.deepEqual(plain(result.route.mechanical), plain(complete.route.mechanical));
        assert.equal(result.values.profit, null);
        if (missing === journal.filled) { assert.equal(result.cycle.gross, null); assert.ok(Number.isFinite(result.values.rewardNet)); }
        if (missing === journal.rewards[0].item) { assert.ok(result.values.grossJournalCost > 0); assert.equal(result.values.rewardNet, null); assert.equal(result.cycle.missingReason, 'missingRewardPrice'); }
        if (missing === target) assert.ok(Number.isFinite(result.values.levelingCost));
    }
    const stale = run(rows.map(row => row.item_id === journal.filled ? { ...row, buy_price_max_date: '2000-01-01T00:00:00Z' } : row));
    assert.equal(stale.quote(journal.filled, 'buy').reason, 'staleTimestamp');
    assert.equal(stale.values.profit, null);
    if (process.argv[2]) {
        const live = run(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
        console.log('LIVE FLETCHER ECONOMIC TRACE', JSON.stringify({ journal: journal.filled,
            purchase: live.cycle.purchase, loot: journal.expectedLoot, rewards: live.cycle.rewardPrices,
            cycle: live.cycle, acquisition: 1000, contract: live.quote(target, 'sell'), result: live.values }, null, 2));
    }
});
const { verifiedRecommendation } = await load('content/js/tools/laborer-contract/recommend.js');
const recommendationRow = (tier, profit, extra = {}) => ({
    tier,
    economics: { status: 'ok', profit, optimal: true, profitSlotDay: extra.profitSlotDay ?? profit, ...extra.economics },
    priceState: { status: 'LIVE', missing: [], ...extra.priceState }
});
test('recommendation follows verified total profit and ignores missing prices', () => {
    const priced = [recommendationRow(3, 100, { profitSlotDay: 100 }), recommendationRow(4, 200, { profitSlotDay: 1 }), recommendationRow(2, -20)];
    const verified = verifiedRecommendation(priced);
    assert.equal(verified.tier.tier, 4);
    assert.equal(verified.metric, 'profit');
    assert.equal(verified.excluded, 0);
    assert.equal(verified.reason, null);
    const missing = [...priced, { tier: 8, economics: { status: 'partial', profit: null, optimal: false }, priceState: { status: 'MISSING', missing: [{ status: 'missing' }] } }];
    const partial = verifiedRecommendation(missing);
    assert.equal(partial.tier.tier, 4);
    assert.equal(partial.excluded, 1);
    assert.equal(verifiedRecommendation([recommendationRow(2, -50), { tier: 8, economics: { status: 'partial', profit: null }, priceState: { status: 'MISSING', missing: [{ status: 'missing' }] } }]).tier.tier, 2);
    const staleLeader = [recommendationRow(4, 500, { priceState: { status: 'STALE', missing: [{ status: 'stale' }] } }), recommendationRow(3, 100)];
    assert.equal(verifiedRecommendation(staleLeader).tier, null);
    assert.match(verifiedRecommendation(staleLeader).reason, /eski fiyat/);
    const limited = [recommendationRow(5, 900, { economics: { optimal: false } }), recommendationRow(3, 100)];
    assert.equal(verifiedRecommendation(limited).tier, null);
    assert.match(verifiedRecommendation(limited).reason, /global seçenek/);
    assert.equal(verifiedRecommendation([]).tier, null);
    assert.match(verifiedRecommendation([]).reason, /tier yok/);
});
console.log(`OK ${checks} laborer calculation checks (XML mechanics, expected-loot scenarios and synthetic arithmetic fixtures)`);

export { load, catalog, economics, planning, prices, progressionRules, indexPrices };
