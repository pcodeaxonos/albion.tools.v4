import assert from 'node:assert/strict';
import { resolveTradePotential, tradeEvidenceKey, indexTradeEvidence, localTradeEvidence } from '../js/core/trade-potential-evidence.mjs';
import { potentialCapacity, potentialSource, validatePotentialPurchases } from '../js/core/island-sales-potential.mjs';
const now = Date.parse('2026-10-12T12:00:00Z'), days = 7;
const request = { server: 'europe', city: 'Bridgewatch', itemId: 'T8_PUMPKIN', quality: 1, side: 'sell' };
const trades = Array.from({ length: days }, (_, i) => ({ sourceId: i, occurredAt: new Date(now - (i + 1) * 86400000).toISOString(), locationName: 'Bridgewatch Market', quality: 1, itemId: request.itemId, kind: 'instant_sell', quantity: 100, unitPriceSilver: 10 }));
const snapshot = { server: 'europe', scope: 'personal', trades };
const apiPoints = trades.map(trade => ({ timestamp: trade.occurredAt, avg_price: 99, item_count: 10000 }));
let calls = [];
const fetchHistory = async (ids, req) => { calls.push({ ids, city: req.city, quality: req.quality }); return new Map(ids.map(id => [id, { points: apiPoints }])); };
const resolve = (requests, snapshot) => resolveTradePotential(requests, { priceOnly: false, snapshot, days, now, fetchHistory });
let result = await resolve([request], snapshot);
let stats = result.get(tradeEvidenceKey(request));
assert.equal(calls.length, 0, 'adequate personal executions prevent API requests');
assert.equal(stats.source, 'Yerel');
assert.equal(stats.price, 10);
assert.equal(stats.volume, 700);
assert.equal(potentialCapacity(stats, 5), 700, 'personal performance is not market-share-scaled');
const buy = { ...request, side: 'buy' };
result = await resolve([request, buy], { ...snapshot, trades: [...trades, ...trades.map(trade => ({ ...trade, sourceId: `buy-${trade.sourceId}`, kind: 'mail_buy', unitPriceSilver: 20 }))] });
assert.equal(calls.length, 0, 'both acquisition and sales can be fully local');
assert.equal(result.get(tradeEvidenceKey(buy)).price, 20, 'buy and sell prices stay distinct');
result = await resolve([request], { ...snapshot, trades: trades.map(trade => ({ ...trade, quantity: null })) });
stats = result.get(tradeEvidenceKey(request));
assert.equal(stats.source, 'Karma');
assert.equal(stats.price, 10, 'API cannot overwrite adequate local price');
assert.equal(stats.volume, 70000, 'API market units alone supply missing capacity');
assert.equal(potentialCapacity(stats, 10), 7000);
assert.equal(potentialSource([stats]), 'Karma');
calls = [];
const missing = { ...request, itemId: 'T8_MILK' };
result = await resolve([request, missing, missing], snapshot);
assert.deepEqual(calls.map(call => call.ids), [['T8_MILK']], 'only missing item fetched, with no duplicate request');
assert.equal(result.get(tradeEvidenceKey(request)).volume, 700, 'sources never double-count matching executions');
for (const change of [
    { server: 'west' }, { scope: 'market' },
    { trades: trades.map(trade => ({ ...trade, quality: null })) },
    { trades: trades.map(trade => ({ ...trade, quality: 2 })) },
    { trades: trades.map(trade => ({ ...trade, locationName: 'Martlock' })) },
    { trades: trades.map(trade => ({ ...trade, kind: 'mail_sell_expired' })) },
    { trades: trades.map(trade => ({ ...trade, occurredAt: '2025-01-01T00:00:00Z' })) }
]) {
    const result = await resolve([request], { ...snapshot, ...change });
    assert.equal(result.get(tradeEvidenceKey(request)).source, 'API');
}
const doubled = localTradeEvidence(indexTradeEvidence({ ...snapshot, trades: [...trades, ...trades] }), request, days, now);
assert.equal(doubled.volume, 700);
const none = await resolveTradePotential([request], { priceOnly: false, snapshot: { trades: [] }, days, now, fetchHistory: async () => new Map() });
assert.equal(none.get(tradeEvidenceKey(request)).reliable, false);
const unstable = trades.map((trade, i) => ({ ...trade, unitPriceSilver: i < 4 ? 10 : 1000 }));
assert.equal(localTradeEvidence(indexTradeEvidence({ ...snapshot, trades: unstable }), request, days, now).reliable, false);
const purchaseStats = { reliable: true, price: 10, volume: 700, volumeKind: 'personal' };
const derived = { slots: new Map([['one', { economic: true, purchaseItemId: request.itemId, purchaseQuantity: 60, market: 0 }], ['two', { economic: true, purchaseItemId: request.itemId, purchaseQuantity: 60, market: 0 }]]) };
assert.throws(() => validatePotentialPurchases(derived, new Map([[request.itemId, purchaseStats]]), days, 10), /kapasitesini/);
derived.slots.delete('two');
assert.equal(validatePotentialPurchases(derived, new Map([[request.itemId, purchaseStats]]), days, 10)[0].quantity, 420);
console.log('Trade potential: local-first buy/sell, selective API, mixed measurement provenance, quality/server/city/direction, stale data, duplicates, personal capacity and acquisition limits passed.');
