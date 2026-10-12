import assert from 'node:assert/strict';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { weightedPriceQuantile, roundHistoricalPrice } from '../js/core/market-primitives.mjs';
import { personalPotentialPrice, marketPotentialPrice, marketOpportunityPrice, potentialPriceAt, indexTradeEvidence, resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';

const now = Date.parse('2026-10-12T12:00:00Z'), days = 28;
const sell = { server: 'europe', city: 'Bridgewatch', itemId: 'T8_PUMPKIN', quality: 1, side: 'sell' }, buy = { ...sell, side: 'buy' };
const snapshot = trades => ({ server: 'europe', scope: 'personal', trades });
const trade = (day, n, price, quantity, patch = {}) => ({ sourceId: `${day}-${n}`, kind: 'instant_sell',
    occurredAt: new Date(now - (day + 1) * DAY_MS).toISOString(), itemId: sell.itemId, locationName: sell.city, quality: 1,
    unitPriceSilver: price, quantity, ...patch });
const trades = Array.from({ length: 5 }, (_, day) => [trade(day, 0, 80, 3), trade(day, 1, 100, 4), trade(day, 2, 120, 3)]).flat();
const evaluate = (rows, request = sell) => personalPotentialPrice(indexTradeEvidence(snapshot(rows)), request, days, now);
const buys = trades.map(row => ({ ...row, kind: 'instant_buy', sourceId: 'buy-' + row.sourceId }));

assert.equal(weightedPriceQuantile([{ price: 10, quantity: 1 }, { price: 20, quantity: 3 }, { price: 30, quantity: 6 }], .25), 20);
assert.equal(weightedPriceQuantile([{ price: 10, quantity: 1 }, { price: 20, quantity: 3 }, { price: 30, quantity: 6 }], .75), 30);
assert.equal(roundHistoricalPrice(12.25, 'buy'), 13); assert.equal(roundHistoricalPrice(12.75, 'sell'), 12);
assert.equal(evaluate(trades).price, 120); assert.equal(evaluate(buys, buy).price, 80);
assert.equal(evaluate(trades).transactions, 15); assert.equal(evaluate(trades).quantity, 50); assert.equal(evaluate(trades).samples, 5);
assert.equal(evaluate([...trades, ...trades]).quantity, 50, 'repeated transactions never increase quantile weight');
const tied = Array.from({ length: 5 }, (_, day) => [trade(day, 0, 100, 1), trade(day, 1, 100, 1)]).flat();
assert.equal(evaluate(tied).reliable, true, 'five days and exactly ten executions at one repeated price are sufficient');
assert.equal(evaluate(tied.slice(0, 9)).reliable, false);
assert.equal(evaluate(trades.filter(row => !row.sourceId.startsWith('4-'))).reliable, false);
const spikes = [...trades, trade(0, 'low-spike', 1, 1), trade(1, 'high-spike', 99999, 1)];
assert.equal(evaluate(spikes).price, 120); assert.equal(evaluate(spikes).rejected, 2);
const small = Array.from({ length: 5 }, (_, day) => Array.from({ length: 20 }, (_, n) => trade(day, `small-${n}`, 80, 1))).flat();
const normal = Array.from({ length: 5 }, (_, day) => [trade(day, 'normal-0', 100, 40), trade(day, 'normal-1', 100, 40)]).flat();
const many = evaluate([...small, ...normal].map(row => ({ ...row, kind: 'instant_buy' })), buy);
assert.equal(many.price, 100, 'a hundred small fills cannot outvote four hundred units');
assert.equal(evaluate([...small.map(row => ({ ...row, unitPriceSilver: 300 })), ...normal]).price, 100, 'small anomalous fills do not outvote robust quantity evidence');
assert.match(evaluate([...tied, trade(0, 'whale', 100, 10000)]).reason, /domine/);
const oneDay = [...tied, ...Array.from({ length: 20 }, (_, n) => trade(0, `same-day-${n}`, 100, 2))];
assert.match(evaluate(oneDay).reason, /domine/);
const dominantTail = [...tied.map(row => ({ ...row, quantity: 35 })), trade(0, 'tail-whale', 80, 150)];
assert.match(evaluate(dominantTail.map(row => ({ ...row, kind: 'instant_buy' })), buy).reason, /domine/);
assert.equal(evaluate(trades.map(row => ({ ...row, quality: null }))).price, null);
assert.equal(evaluate(trades.map(row => ({ ...row, quantity: null }))).price, null);
assert.equal(evaluate(trades.map(row => ({ ...row, sourceId: null }))).price, null, 'independence requires a stable execution ID');
assert.equal(evaluate(trades.map(row => ({ ...row, occurredAt: new Date(Date.parse(row.occurredAt) - 8 * DAY_MS).toISOString() }))).reliable, false);
assert.equal(evaluate(trades.map(row => ({ ...row, occurredAt: new Date(now + DAY_MS).toISOString() }))).reliable, false);
const recentSeven = trades.map(row => ({ ...row, occurredAt: new Date(Date.parse(row.occurredAt) - 6 * DAY_MS).toISOString() }));
assert.equal(evaluate(recentSeven).reliable, true, 'latest eligible execution may be exactly seven days old');

const market = Array.from({ length: 28 }, (_, day) => ({ timestamp: new Date(Math.floor(now / DAY_MS) * DAY_MS - (day + 1) * DAY_MS).toISOString(),
    avg_price: day < 8 ? 80 : (day < 20 ? 100 : 120), item_count: 10 }));
const m = marketPotentialPrice(market, sell, days, now, 'Yerel AODP');
assert.equal(m.price, 120); assert.equal(m.transactions, null); assert.equal(m.quantity, 280);
assert.match(m.evidenceType, /Günlük ortalama/); assert.equal(m.volume, undefined, 'quantile evidence exposes no production capacity');
assert.equal(marketPotentialPrice(market, buy, days, now, 'API').price, 80);
assert.match(marketPotentialPrice(market, buy, days, now, 'API').marketMeaning, /Buy emir/);
assert.equal(marketPotentialPrice(market.slice(0, 19), sell, days, now, 'Yerel AODP').reliable, false, '70% market coverage remains required');
assert.equal(marketPotentialPrice(market.map(row => ({ ...row, item_count: null })), sell, days, now, 'API').reliable, false);
const rejectedFresh = market.map((row, n) => ({ ...row, avg_price: n < 2 ? 10000 : row.avg_price }));
assert.equal(marketPotentialPrice(rejectedFresh, sell, days, now, 'API').reliable, false, 'discarded fresh anomalies cannot make old prices appear fresh');

let localCalls = 0, apiCalls = 0;
const options = { days, now, priceOnly: true,
    fetchLocalHistory: async ids => { localCalls++; return new Map(ids.map(id => [id, { points: market }])); },
    fetchHistory: async ids => { apiCalls++; return new Map(ids.map(id => [id, { points: market }])); } };
let result = await resolveTradePotential([sell, buy], { ...options, snapshot: snapshot([...trades, ...buys]) });
assert.equal(localCalls, 0); assert.equal(apiCalls, 0);
assert.equal(result.get(tradeEvidenceKey(buy)).source, 'Kişisel'); assert.equal(result.get(tradeEvidenceKey(sell)).method, 'P75');
assert.equal(potentialPriceAt(result, sell, 28, now).reliable, true);
assert.equal(potentialPriceAt(result, sell, 7, now).price, null, 'cached results cannot leak between periods');
assert.equal(potentialPriceAt(result, sell, 28, now + 8 * DAY_MS).price, null, 'cached evidence cannot outlive its freshness');
result = await resolveTradePotential([sell], { ...options, snapshot: snapshot([]) });
assert.equal(localCalls, 1); assert.equal(apiCalls, 0); assert.equal(result.get(tradeEvidenceKey(sell)).source, 'Yerel AODP');
result = await resolveTradePotential([sell, sell], { ...options, snapshot: snapshot([]), fetchLocalHistory: async () => new Map() });
assert.equal(apiCalls, 1); assert.equal(result.get(tradeEvidenceKey(sell)).source, 'API');
result = await resolveTradePotential([sell], { days, now, priceOnly: true, snapshot: snapshot([]), fetchLocalHistory: async () => new Map(), fetchHistory: async () => new Map() });
assert.equal(result.get(tradeEvidenceKey(sell)).price, null); assert.equal(result.get(tradeEvidenceKey(sell)).reliable, false);
console.log('Potential prices: weighted P25/P75, precision, 5 days/10 executions/7-day freshness, repeats, spikes, small fills, trade/day/tail dominance, unknown quality/quantity, market evidence semantics, local/API fallback and independent buy/sell passed.');

const hourly = [40503,58565,58565,61000].map((avg_price, i) => ({ timestamp: new Date(now - (i+1)*3600000).toISOString(), avg_price, item_count: i ? 30 : 4 }));
assert.equal(marketOpportunityPrice(hourly,buy,days,now).price,40503);
assert.equal(marketOpportunityPrice(hourly,sell,days,now).price,61000);
assert.equal(marketOpportunityPrice(hourly,buy,days,now).selectedQuantity,4);
assert.equal(marketOpportunityPrice(hourly.map(row=>({...row,item_count:0})),buy,days,now).reliable,false);
assert.equal(marketOpportunityPrice([...hourly,{timestamp:new Date(now-1000).toISOString(),avg_price:1,item_count:1}],buy,days,now).price,40503);
const hourlyResult = await resolveTradePotential([buy],{...options,snapshot:snapshot(buys),fetchHourlyHistory:async()=>new Map([[buy.itemId,{points:hourly.map(row=>({...row,avg_price:40}))}]])});
assert.equal(hourlyResult.get(tradeEvidenceKey(buy)).price,40);
console.log('Hourly traded extrema, four-unit evidence, zero-volume rejection, outlier rejection and personal/API comparison passed.');

const { readPotentialSnapshots, savePotentialSnapshots } = await import('../js/core/potential-price-snapshot.mjs');
const stored = new Map(), storage = { getItem:key=>stored.get(key)??null, setItem:(key,value)=>stored.set(key,value) };
const first = new Map([[tradeEvidenceKey(buy),marketOpportunityPrice(hourly,buy,days,now)]]);
savePotentialSnapshots(storage,[buy],days,first,now);
const restored = readPotentialSnapshots(storage,[buy],days);
assert.equal(potentialPriceAt(restored,buy,days,now+100*DAY_MS).price,40503,'saved price remains fixed until manual refresh');
assert.equal(readPotentialSnapshots(storage,[buy],7).size,1,'sale horizon changes reuse the saved purchase price');
assert.equal(readPotentialSnapshots(storage,[sell],7).size,0,'sale targets remain horizon specific');
assert.equal(readPotentialSnapshots(storage,[{...buy,city:'Brecilien'}],days).size,0,'cities are isolated');
const personal = await resolveTradePotential([buy],{...options,opportunity:true,snapshot:snapshot(buys),fetchLocalHistory:()=>{throw Error('personal evidence must win')},fetchHourlyHistory:()=>{throw Error('personal evidence must win')}});
assert.equal(personal.get(tradeEvidenceKey(buy)).source,'Kişisel');
assert.equal(personal.get(tradeEvidenceKey(buy)).price,80);
console.log('Persisted snapshots, period/city isolation and personal execution priority passed.');

const { includePotentialOrder } = await import('../js/core/potential-order-candidate.mjs');
const orderRow = {item_id:sell.itemId,city:sell.city,quality:1,sell_price_min:40105,sell_price_min_date:new Date(now-1000).toISOString(),buy_price_max:40000,buy_price_max_date:new Date(now-1000).toISOString()};
assert.equal(includePotentialOrder({reliable:true,price:35152},sell,orderRow,days,now).price,40104);
assert.equal(includePotentialOrder({reliable:true,price:58565},buy,orderRow,days,now).price,40001);
assert.equal(includePotentialOrder({reliable:true,price:45000},sell,orderRow,days,now).price,45000);
assert.equal(includePotentialOrder({reliable:true,price:35152},sell,{...orderRow,quality:2},days,now).price,35152);
assert.equal(includePotentialOrder({reliable:true,price:35152},sell,{...orderRow,sell_price_min_date:new Date(now-24*3600000).toISOString()},days,now).price,35152);
assert.match(includePotentialOrder(null,sell,orderRow,days,now).evidenceType,/gerçekleşmiş işlem değil/);
console.log('Live packet buy/sell candidates: favorable bounds, ticks, quality/freshness and unexecuted-order labeling passed.');

const { saleHorizonTarget, SALE_HORIZONS } = await import('../js/core/potential-sale-horizon.mjs');
const forecastPoints = Array.from({length:90},(_,i)=>({timestamp:new Date(now-(90-i)*DAY_MS).toISOString(),price:30000+i*300,quantity:20}));
const forecastEvidence = {reliable:true,price:35152,source:'Oyun Market History',forecastPoints};
const horizonPrices = SALE_HORIZONS.map(period=>saleHorizonTarget(forecastEvidence,sell,orderRow,period.days,now).price);
assert.equal(horizonPrices[0],40104,'one-day target follows the current sell order');
assert(horizonPrices[1]>horizonPrices[0],'longer time admits supported historical upside');
assert(horizonPrices[4]>horizonPrices[1],'monthly and weekly goals differ with evidence');
assert(horizonPrices.every((price,i)=>i===0||price>=horizonPrices[i-1]),'waiting longer never kills the price');
assert(horizonPrices.every(price=>price<=56700),'targets stay below observed ceiling');
const sparseTarget = saleHorizonTarget({forecastPoints:[]},sell,orderRow,28,now);
assert.equal(sparseTarget.price,40104);
assert.match(sparseTarget.reason,/yeterli/);
console.log('Sale horizons: 1-day order anchor, horizon-specific upside, monotonic targets, observed ceiling and sparse-evidence disclosure passed:',horizonPrices);
