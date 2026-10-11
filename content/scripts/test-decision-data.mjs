import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { assessQuote, DECISION_POLICY } from '../js/core/decision-engine.mjs';
import { priceIndexKey, marketSeriesKey } from '../js/core/market-primitives.mjs';

let server = 'europe', responseServer = 'europe', observedSignal;
const at = new Date().toISOString();
const identity = { server, itemId: 'ITEM', city: 'Martlock', quality: 1 };
const refs = new Map(['buy', 'sell'].map(side => [marketSeriesKey({ ...identity, side }), { ...identity, side, source: 'quote-history', price: side === 'buy' ? 50 : 100 }]));
let rejectHistory = false;
const dependencies = {
    './market.js': { priceIndexKey, fetchPrices: async (_, __, options) => { observedSignal = options.signal; return [{ item_id: 'ITEM', city: 'Martlock', quality: 1, buy_price_max: 50, sell_price_min: 100, buy_price_max_date: at, sell_price_min_date: at }, { item_id: 'ITEM', city: 'Martlock', quality: 2, sell_price_min: 999, sell_price_min_date: at }]; } },
    './long-term-quotes.js': { fetchLongTermIndex: async () => { if (rejectHistory) throw new Error('offline'); return refs; } },
    './market-primitives.mjs': { marketSeriesKey },
    './settings.js': { getServer: () => ({ id: server }), localPriceHost: () => 'http://hub', getSettings: () => ({ priceSource: 'api', premium: true }) },
    './catalog.js': { getCraftRecipes: () => [], getEconomyConstant: key => ({ setup_fee: .025, tax_premium: .04 })[key] ?? null },
    '../db/store.js': { getAll: () => [] },
    './decision-engine.mjs': { assessQuote, DECISION_POLICY },
    './recipe-mechanics.mjs': { matchingRecipeMechanics: () => null },
    './bonus-cities.js': { bonusFamilyMeta: () => null },
    './craft-bonus.js': { hasTodayDailyBonus: () => false, defaultCraftBonusRate: () => 0 },
    './economy-math.js': { returnRateFromProductionBonus: value => value / (100 + value) }
};
const context = vm.createContext({ URLSearchParams, Date, fetch: async () => ({ ok: true, json: async () => ({ server: responseServer, itemId: 'ITEM', city: 'Martlock', quality: 1, buy: { points: [] }, sell: { points: [] } }) }) });
const module = new vm.SourceTextModule(fs.readFileSync('content/js/core/decision-data.js', 'utf8'), { context });
await module.link(specifier => {
    const values = dependencies[specifier];
    assert.ok(values, specifier);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
});
await module.evaluate();
const { loadDecisionQuotes, loadDecisionSeries, decisionFees } = module.namespace;
const controller = new AbortController();
const data = await loadDecisionQuotes(['ITEM'], 'Martlock', { signal: controller.signal });
assert.equal(observedSignal, controller.signal);
assert.equal(data.quotes.ITEM.buy.price, 50); assert.equal(data.quotes.ITEM.sell.price, 100);
assert.equal(data.quotes.ITEM.sell.reference.side, 'sell'); assert.equal(data.quotes.ITEM.buy.reference.side, 'buy');
assert.equal(data.quotes.ITEM.buy.sourceQuoteAt, at);
assert.equal(decisionFees().taxRate, .04);
rejectHistory = true;
assert.match((await loadDecisionQuotes(['ITEM'], 'Martlock')).historyError, /arşiv/);
controller.abort();
await assert.rejects(loadDecisionQuotes(['ITEM'], 'Martlock', { signal: controller.signal }), /abort/i);
responseServer = 'west';
await assert.rejects(loadDecisionSeries('ITEM', 'Martlock'), /kimliği/);
console.log('PASS quote sides, quality isolation, source timestamps, archive degradation, abort propagation, history server identity, catalog rates');
