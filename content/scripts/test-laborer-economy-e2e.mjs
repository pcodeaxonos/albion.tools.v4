import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalog, economics, planning, prices, progressionRules, indexPrices } from './test-laborer-contract.mjs';

const fixture = JSON.parse(fs.readFileSync('content/scripts/fixtures/laborer-economy-prices.json', 'utf8').replace(/^\uFEFF/, ''));
const now = Date.parse(fixture.capturedAt);
const index = indexPrices(fixture.rows);
const rules = progressionRules(catalog, 'hunter');
const manualJournals = { 2: 8400, 3: 10000, 4: 20000, 5: 40000 };
const auditOverrides = new Map();
function quote(item, intent) {
    const side = intent === 'buy' ? 'buy' : 'sell';
    const live = prices.resolvePrice({ index, item, city: 'Martlock', side, intent, now });
    if (live.status === 'ok') return live;
    const row = fixture.rows.find(row => row.item_id === item);
    // Explicit audit inputs, never an application fallback. For stale positive
    // quotes the entered value is recorded from this snapshot's selected book.
    const entered = intent === 'buy' && item.includes('_JOURNAL_HUNTER_FULL')
        ? manualJournals[Number(item[1])]
        : intent === 'sell' && row?.sell_price_min > 0 ? row.sell_price_min - 1 : null;
    if (!(entered > 0)) return live;
    auditOverrides.set(`${item}/${intent}`, { item, intent, price: entered, reason: live.reason });
    return prices.resolvePrice({ index, item, city: 'Martlock', side, intent, now, override: entered });
}

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
const results = [];
let orderedTrace;
for (const [startTier, targetTier] of [[2, 3], [2, 4], [2, 6], [5, 6]]) {
    const acquisition = startTier === 2 ? 1000 : 0;
    const plan = planning.planProgression({ mechanics: rules, startTier, targetTier,
        journalEconomics: journal => economics.cycleEconomics(journal, quote, true) });
    assert.equal(plan.status, 'ok');
    assert.equal(plan.economicAvailable, true);
    const contract = quote(`T${targetTier}_LABOURER_CONTRACT_HUNTER`, 'sell');
    let journalGross = 0, rewardGross = 0, rewardNet = 0, fameState = 0, tier = startTier;
    const cycles = [];
    // Independent oracle: reads raw catalog entries, does not use any production
    // reward, fame, purchase/sale fee or aggregate economics helper.
    for (const cycle of plan.sequence) {
        const journal = catalog.journals.find(row => row.filled === cycle.journal);
        const unitPrice = quote(journal.filled, 'buy').price;
        const gross = unitPrice * 1.025;
        const weights = journal.loot.reduce((sum, row) => sum + row.weight, 0);
        let grossReward = 0, fame = 0;
        const loot = journal.loot.map(row => {
            const quantity = journal.baseLootAmount * row.weight / weights * row.amount;
            const price = quote(row.item, 'sell');
            fame += quantity * row.labourerFame;
            grossReward += quantity * price.price;
            return { item: row.item, quantity, usedPrice: price.price, mode: price.mode };
        });
        const netReward = grossReward * .935;
        const threshold = catalog.mechanics.byType.hunter.stages[tier].requiredFame;
        fameState += fame;
        if (fameState >= threshold - 1e-8) { fameState -= threshold; tier++; }
        near(cycle.fame, fame, 'cycle fame');
        near(cycle.economics.gross, gross, 'journal gross');
        near(cycle.economics.rewardGross, grossReward, 'reward gross');
        near(cycle.economics.rewardNet, netReward, 'reward net');
        near(cycle.economics.net, gross - netReward, 'net cycle');
        journalGross += gross; rewardGross += grossReward; rewardNet += netReward;
        cycles.push({ journal: journal.filled, threshold, fame, unitPrice, gross, loot, grossReward, netReward, emptyJournalValue: 0 });
    }
    assert.equal(tier, targetTier);
    near(plan.end.progress, fameState, 'carry-over');
    const days = cycles.length, hours = days * 22;
    const leveling = acquisition + journalGross - rewardNet;
    const contractGross = contract.price;
    const tax = contractGross * .04, setup = contractGross * .025;
    const contractNet = contractGross - tax - setup;
    const profit = contractNet - leveling;
    const breakEven = Math.max(1, Math.ceil(leveling / .935));
    const actual = economics.evaluatePlan({ plan, acquisition, quantity: 1, sale: contract, premium: true });
    const expected = { grossJournalCost: journalGross, rewardNet, levelingCost: leveling,
        contractGross, contractNet, profit, profitDay: profit / days, profitSlotDay: profit / days,
        breakEven, days, actualHours: hours };
    for (const [key, value] of Object.entries(expected)) near(actual[key], value, key);
    for (const quantity of [10, 30]) {
        const scaled = economics.evaluatePlan({ plan, acquisition, quantity, sale: contract, premium: true });
        for (const key of ['grossJournalCost', 'rewardNet', 'levelingCost', 'contractGross', 'contractNet', 'profit', 'profitDay', 'initialCapital', 'peakCapital']) near(scaled[key], actual[key] * quantity, `quantity ${quantity} ${key}`);
        near(scaled.profitSlotDay, actual.profitSlotDay, 'slot/day quantity invariant');
        near(scaled.days, days, 'days quantity invariant');
        near(scaled.actualHours, hours, 'hours quantity invariant');
        assert.equal(scaled.breakEven, breakEven);
    }
    if (startTier === 5) {
        const continued = economics.compareContinue({ plan, currentSale: quote('T5_LABOURER_CONTRACT_HUNTER', 'sell'), nextSale: contract, quantity: 1, premium: true });
        near(continued.additionalProfit, profit - quote('T5_LABOURER_CONTRACT_HUNTER', 'sell').price * .935, 'owned opportunity value');
    }
    results.push({ scenario: `T${startTier}→T${targetTier}`, expected, actual, cycles });
    if (startTier === 2 && targetTier === 3) {
        const first = cycles[0];
        assert.equal(cycles.length, 1);
        orderedTrace = [
            ['1 Acquisition cost', acquisition], ['2 Fame threshold', first.threshold],
            ['3 Journal', first.journal], ['4 Expected labourer fame / cycle', first.fame],
            ['5 Cycle count', days], ['6 Planning days', days], ['7 Mechanical hours', hours],
            ['8 Journal unit price', first.unitPrice], ['9 Journal gross cost', journalGross],
            ['10 Loot quantities', first.loot.map(({item, quantity}) => ({item, quantity}))],
            ['11 Reward prices', first.loot.map(({item, usedPrice, mode}) => ({item, usedPrice, mode}))],
            ['12 Reward gross', rewardGross], ['13 Reward net', rewardNet],
            ['14 Empty journal', { value: 0, included: false, reason: 'Return not verified in dump; no observed return supplied.' }],
            ['15 Net leveling cost', leveling], ['16 Contract gross', contractGross],
            ['17 Contract tax', tax], ['18 Contract setup', setup], ['19 Contract net', contractNet],
            ['20 Net profit', profit], ['21 Profit/day', profit / days],
            ['22 Profit/slot/day', profit / days], ['23 Break-even gross', breakEven]
        ];
        console.log('T2→T3 ORDERED ECONOMY TRACE', JSON.stringify(orderedTrace, null, 2));
    }
}
const report = { source: fixture.source, capturedAt: fixture.capturedAt,
    scenario: 'Fletcher / Martlock / Buy Order / Sell Order / Premium / 100% yield',
    manualOverrides: [...auditOverrides.values()], orderedTrace, results };
fs.writeFileSync('content/scripts/fixtures/laborer-economy-e2e-results.json', JSON.stringify(report, null, 2) + '\n');
console.log('E2E EXPECTED / ACTUAL', JSON.stringify(results.map(row => ({ scenario: row.scenario,
    cycles: row.actual.cycles, days: row.actual.days, expectedProfit: row.expected.profit,
    actualProfit: row.actual.profit, breakEven: row.actual.breakEven })), null, 2));
console.log('PASS 4 end-to-end scenarios; 8 quantity scaling scenarios. End-to-end economy calculation verified');
