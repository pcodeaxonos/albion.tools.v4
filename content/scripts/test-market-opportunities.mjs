import assert from 'node:assert/strict';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { quotedBookPrice } from '../js/core/market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from '../js/core/market-fees.mjs';
import { analyzeMarketCell, assessMarketSide, rankMarketOpportunities } from '../js/core/market-opportunities.mjs';
import { applyLiveQuote, quoteFreshnessPoints, scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';

const now = Date.parse('2026-10-10T12:00:00Z');
const fees = { setupFeeRate: 0.025, taxPremiumRate: 0.04, taxFreeRate: 0.08 };
const cell = { server: 'europe', itemId: 'T4_BAG', city: 'Martlock', quality: 1, fees, premium: true, now };

function side(price, refPrice, options = {}) {
    const at = options.at ?? now;
    const count = options.samples ?? 12;
    const points = [];
    for (let index = count; index >= 1; index -= 1) {
        points.push({
            price: refPrice,
            seenAt: new Date(at - (index + 2) * 60 * 60 * 1000).toISOString(),
            source: 'market-order-packets'
        });
    }
    points.push(
        { price, seenAt: new Date(at - 60 * 60 * 1000).toISOString(), source: 'market-order-packets' },
        { price, seenAt: new Date(at).toISOString(), source: 'market-order-packets' }
    );
    return assessMarketSide({ points, now });
}

assert.equal(quotedBookPrice(400, 'buy', 'buy'), 401);
assert.equal(quotedBookPrice(550, 'sell', 'sell'), 549);
assert.equal(quotedBookPrice(550, 'sell', 'buy'), 550);
assert.ok(Math.abs(purchaseCostFromRates(100, { setup: true, setupFeeRate: 0.025 }) - 102.5) < 1e-9);
assert.equal(saleProceedsFromRates(1000, { taxRate: 0.04, setup: false, setupFeeRate: 0.025 }), 960);

const spike = assessMarketSide({
    points: [
        { price: 100, seenAt: '2026-10-10T11:00:00Z' },
        { price: 40, seenAt: '2026-10-10T12:00:00Z' }
    ],
    now
});
assert.equal(spike.anomalous, true, 'the first reliable departure is listed');
assert.equal(spike.confirmed, false);
assert.equal(spike.reference, 100, 'the new price is excluded from its own reference');
const spikeRow = analyzeMarketCell({ ...cell, buy: spike, sell: assessMarketSide({ now }) });
assert.equal(spikeRow.review, 'unconfirmed');
assert.equal(spikeRow.reviewLabel, 'Yeni / Doğrulanmamış');

const alone = assessMarketSide({ points: [{ price: 40, seenAt: '2026-10-10T12:00:00Z' }], now });
assert.equal(alone.reference, null, 'one observation is not compared with itself');
assert.equal(alone.anomalous, false);
assert.equal(analyzeMarketCell({ ...cell, buy: alone, sell: assessMarketSide({ now }) }), null);

const stale = side(70, 100, { at: now - 7 * 60 * 60 * 1000 });
assert.equal(stale.stale, true);
assert.equal(stale.anomalous, false, 'a quote older than the shared stale window is not a current opportunity');

const anchored = assessMarketSide({
    points: [{ price: 70, seenAt: '2026-10-10T12:00:00Z' }],
    reference: { price: 100, source: 'sales-history-anchor', validDays: 20 }, now
});
assert.equal(anchored.reference, null, 'a sales average cannot invent a Buy/Sell reference');
assert.equal(anchored.anomalous, false);

const provisional = assessMarketSide({
    points: [8, 9, 10].map((hour) => ({ price: 200, seenAt: `2026-10-10T0${hour}:00:00Z` }))
        .concat([{ price: 400, seenAt: '2026-10-10T12:00:00Z' }]),
    now
});
assert.equal(provisional.provisional, true);
assert.equal(provisional.reference, 200);
assert.equal(provisional.anomalous, true);
assert.equal(provisional.confirmed, false, 'same-day hourly history is enough; a completed calendar day is not required');

const shortSeries = analyzeMarketCell({ ...cell, itemId: 'T4_YOUNG', buy: assessMarketSide({ now }), sell: side(150, 100, { samples: 2 }) });
const longSeries = analyzeMarketCell({ ...cell, itemId: 'T4_MATURE', buy: assessMarketSide({ now }), sell: side(150, 100, { samples: 12 }) });
assert.ok(shortSeries.score > 0, 'a short series stays in the list at low confidence');
assert.ok(longSeries.score > shortSeries.score * 5, 'few samples and a short span rank well below a longer reference');

const buyDown = analyzeMarketCell({ ...cell, itemId: 'T4_SKILLBOOK_STANDARD', buy: side(70, 100), sell: side(100, 100) });
assert.equal(buyDown.pattern, 'buy-down-sell-flat');
assert.deepEqual(buyDown.anomalies, ['buy-down']);
const buyOrder = buyDown.strategies.find((row) => row.id === 'place-buy-order');
assert.ok(buyOrder.advantageSilver > 0);
assert.equal(buyOrder.netSilver, null);
assert.equal(buyOrder.kind, 'savings');
assert.match(buyOrder.note, /dolacağı bilinmiyor/);
assert.ok(buyDown.caveats.some((line) => /derinliği/.test(line)));
assert.ok(buyDown.strategies.every((row) => row.kind !== 'realized'));

const bothDown = analyzeMarketCell({ ...cell, buy: side(70, 100), sell: side(70, 100) });
assert.equal(bothDown.pattern, 'both-down');
assert.ok(bothDown.caveats.some((line) => /arbitraj değildir/.test(line)));
assert.equal(bothDown.strategies.some((row) => row.id === 'local-flip'), false);

const widened = analyzeMarketCell({ ...cell, buy: side(70, 100), sell: side(150, 100) });
assert.equal(widened.pattern, 'spread-widen');
assert.equal(widened.strategies.find((row) => row.id === 'local-make').kind, 'unrealized');
assert.match(widened.strategies.find((row) => row.id === 'local-make').note, /gerçekleşmiş kâr/);
assert.ok(widened.caveats.some((line) => /Makas/.test(line)));

const cheap = analyzeMarketCell({ ...cell, itemId: 'T2_JUNK', buy: assessMarketSide({ now }), sell: side(150, 30) });
const expensive = analyzeMarketCell({ ...cell, itemId: 'T8_BAG', buy: assessMarketSide({ now }), sell: side(96000, 80000) });
assert.ok(cheap.sell.deviation > expensive.sell.deviation);
assert.ok(expensive.score > cheap.score, 'a large percent on a cheap item must not outrank a larger silver move');
assert.equal(rankMarketOpportunities([cheap, expensive])[0].itemId, 'T8_BAG');

const extreme = analyzeMarketCell({
    ...cell, itemId: 'T6_EXTREME',
    buy: side(3168, 3000, { samples: 2 }),
    sell: side(999999, 3000, { samples: 2 })
});
const solid = analyzeMarketCell({ ...cell, itemId: 'T5_SOLID', buy: side(8000, 8000), sell: side(12000, 8000) });
assert.equal(extreme.anomalies.includes('sell-up'), true, 'an extreme sell print stays an anomaly');
assert.equal(extreme.sell.price, 999999);
assert.ok(extreme.primary.advantageSilver > solid.primary.advantageSilver * 20);
assert.equal(extreme.parts.feasibility, null);
assert.equal(solid.parts.feasibility, null);
assert.ok(solid.rankScore > extreme.rankScore, 'unfilled extreme silver does not outrank a smaller referenced move');
assert.equal(rankMarketOpportunities([extreme, solid])[0].itemId, 'T5_SOLID');

const repeated = quoteFreshnessPoints([
    { source: 'aodp-current', price: 100, bucketAt: '2026-10-10T08:00:00Z', seenAt: '2026-10-10T08:00:00Z', sourceQuoteAt: '2026-10-10T08:00:00Z' },
    { source: 'aodp-current', price: 100, bucketAt: '2026-10-10T10:00:00Z', seenAt: '2026-10-10T10:00:00Z', sourceQuoteAt: '2026-10-10T08:00:00Z' }
]);
const kept = assessMarketSide({ points: repeated, now });
assert.equal(kept.reference, 100, 'hourly polls of one quote remain separate reference observations');
assert.equal(repeated[0].seenAt, '2026-10-10T08:00:00Z');
assert.equal(repeated[1].bucketAt, '2026-10-10T10:00:00Z');
const moved = applyLiveQuote(repeated, {
    price: 140, source: 'aodp-current', sourceQuoteAt: '2026-10-10T08:00:00Z', fetchedAt: '2026-10-10T12:00:00Z'
});
assert.equal(moved[0].price, 100, 'an older source time does not rewrite an earlier hour');
assert.equal(moved.at(-1).price, 140);
assert.equal(moved.at(-1).bucketAt, '2026-10-10T12:00:00.000Z');
const continued = assessMarketSide({ points: quoteFreshnessPoints(moved), now });
assert.equal(continued.reference, 100);
assert.equal(continued.price, 140);
assert.equal(continued.anomalous, true);

const flip = analyzeMarketCell({ ...cell, buy: side(1000, 1000), sell: side(100, 100) });
const flipFree = analyzeMarketCell({ ...cell, premium: false, buy: side(1000, 1000), sell: side(100, 100) });
assert.equal(Math.round(flip.strategies.find((row) => row.id === 'local-flip').netSilver), 860);
assert.equal(Math.round(flipFree.strategies.find((row) => row.id === 'local-flip').netSilver), 820);
assert.match(flip.strategies.find((row) => row.id === 'local-flip').note, /kâr garantisi değildir/);

const buyUp = analyzeMarketCell({ ...cell, itemId: 'T4_BUY_UP', buy: side(150, 100), sell: assessMarketSide({ now }) });
const buyDownOnly = analyzeMarketCell({ ...cell, itemId: 'T4_BUY_DOWN', buy: side(70, 100), sell: assessMarketSide({ now }) });
const sellUp = analyzeMarketCell({ ...cell, itemId: 'T4_SELL_UP', buy: assessMarketSide({ now }), sell: side(150, 100) });
const sellDown = analyzeMarketCell({ ...cell, itemId: 'T4_SELL_DOWN', buy: assessMarketSide({ now }), sell: side(70, 100) });
assert.deepEqual(buyUp.anomalies, ['buy-up']);
assert.deepEqual(buyDownOnly.anomalies, ['buy-down']);
assert.deepEqual(sellUp.anomalies, ['sell-up']);
assert.deepEqual(sellDown.anomalies, ['sell-down']);

function leveled(price, refPrice, { formedHoursAgo = 1, repeats = 2 } = {}) {
    const points = [];
    for (let index = 12; index >= 1; index -= 1) {
        points.push({ price: refPrice, seenAt: new Date(now - (formedHoursAgo + 2 + index) * 60 * 60 * 1000).toISOString() });
    }
    for (let index = 0; index < repeats; index += 1) {
        const at = repeats === 1 ? now : now - ((repeats - 1 - index) * formedHoursAgo * 60 * 60 * 1000);
        points.push({ price, seenAt: new Date(at).toISOString() });
    }
    return assessMarketSide({ points, now });
}
const older = analyzeMarketCell({ ...cell, itemId: 'T4_OLD', buy: assessMarketSide({ now }), sell: leveled(150, 100, { formedHoursAgo: 4, repeats: 2 }) });
const newer = analyzeMarketCell({ ...cell, itemId: 'T4_NEW', buy: assessMarketSide({ now }), sell: leveled(150, 100, { formedHoursAgo: 0, repeats: 1 }) });
assert.equal(newer.review, 'unconfirmed');
assert.equal(older.review, 'confirmed');
assert.ok(older.score > newer.score, 'a repeated observation outranks the same new print on importance');
assert.equal(rankMarketOpportunities([older, newer], { mode: 'importance' })[0].itemId, 'T4_OLD');
assert.equal(rankMarketOpportunities([older, newer], { mode: 'recent' })[0].itemId, 'T4_NEW');
assert.equal(rankMarketOpportunities([older, newer], { mode: 'balanced' })[0].itemId, 'T4_NEW');

const thetfordBuy = side(200, 100);
const martlockSell = side(100, 100);
const carried = analyzeMarketCell({
    ...cell, city: 'Martlock', buy: side(90, 90), sell: martlockSell,
    peers: [{ city: 'Thetford', buy: thetfordBuy, sell: assessMarketSide({ now }) }]
});
const haul = carried.strategies.find((row) => row.id === 'cross-city-instant');
assert.equal(haul.fromCity, 'Martlock');
assert.equal(haul.toCity, 'Thetford');
assert.ok(haul.netSilver > 0);
assert.match(haul.note, /Taşıma maliyeti/);
assert.equal(analyzeMarketCell({
    ...cell, city: 'Thetford', buy: side(200, 190), sell: side(210, 210),
    peers: [{ city: 'Martlock', buy: side(90, 90), sell: martlockSell }]
}), null);

const history = new OrderPriceHistory({ servers: ['europe'] });
const emptyRepo = { identities() { return []; }, seriesFor() { return null; }, currentQuote() { return null; } };
function cover(itemId, city, side, price, days) {
    for (const day of days) for (let hour = 0; hour <= 12; hour++) {
        history.record({ server: 'europe', itemId, city, quality: 1, side, price,
            seenAt: `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z` }, now);
    }
}
cover('T4_BAG', 'Martlock', 'buy', 100, [5, 6, 7, 8, 9]);
history.record({ server: 'europe', itemId: 'T4_BAG', city: 'Martlock', quality: 1, side: 'buy', price: 70, seenAt: '2026-10-10T10:00:00Z' }, now);
history.record({ server: 'europe', itemId: 'T4_BAG', city: 'Martlock', quality: 1, side: 'buy', price: 70, seenAt: '2026-10-10T11:00:00Z' }, now);
cover('T4_CAPE', 'Martlock', 'sell', 100, [5, 6, 7, 8, 9]);
history.record({ server: 'europe', itemId: 'T4_CAPE', city: 'Martlock', quality: 1, side: 'sell', price: 40, seenAt: '2026-10-10T11:00:00Z' }, now);
cover('T4_POTION', 'Martlock', 'buy', 100, [9]);
history.record({ server: 'europe', itemId: 'T4_POTION', city: 'Martlock', quality: 1, side: 'buy', price: 70, seenAt: '2026-10-10T10:00:00Z' }, now);
history.record({ server: 'europe', itemId: 'T4_POTION', city: 'Martlock', quality: 1, side: 'buy', price: 70, seenAt: '2026-10-10T11:00:00Z' }, now);
for (const hour of [8, 9, 10]) {
    history.record({ server: 'europe', itemId: 'T5_WOOD', city: 'Lymhurst', quality: 1, side: 'sell', price: 200, seenAt: `2026-10-10T0${hour}:00:00Z` }, now);
}
history.record({ server: 'europe', itemId: 'T5_WOOD', city: 'Lymhurst', quality: 1, side: 'sell', price: 400, seenAt: '2026-10-10T12:00:00Z' }, now);
history.record({ server: 'europe', itemId: 'T2_JUNK', city: 'Bridgewatch', quality: 1, side: 'buy', price: 15, seenAt: '2026-10-10T12:00:00Z' }, now);

const scan = scanQuoteBooks({ server: 'europe', packetHistory: history, repository: emptyRepo, now, premium: true, fees });
const found = Object.fromEntries(scan.opportunities.map((row) => [row.itemId, row]));
assert.equal(found.T4_BAG.anomalies.includes('buy-down'), true);
assert.equal(found.T4_BAG.review, 'confirmed');
assert.ok(found.T4_BAG.strategies.some((row) => row.id === 'place-buy-order'));
assert.equal(found.T4_CAPE.anomalies.includes('sell-down'), true);
assert.equal(found.T4_CAPE.review, 'unconfirmed');
assert.equal(found.T5_WOOD.provisional ?? found.T5_WOOD.sell.provisional, true);
assert.equal(found.T5_WOOD.review, 'unconfirmed');
assert.equal(found.T2_JUNK, undefined);
assert.equal(scan.strategyId, 'median-28d');
assert.equal(scan.funnel.filtered, scan.funnel.cells - scan.funnel.shown);
assert.equal(Object.values(scan.excluded).reduce((sum, count) => sum + count, 0), scan.funnel.filtered);
assert.ok(scan.excluded.singleObservation >= 1);
assert.ok(scan.funnel.referenceable >= 4);
assert.ok(scan.funnel.anomalies >= 4);

console.log('Market opportunities: directions, provisional reference, confirmation, fees, ranking and archive scan passed.');
