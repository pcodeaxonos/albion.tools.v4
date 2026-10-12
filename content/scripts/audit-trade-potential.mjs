import { findEuropeTradesFile, readTradesFile } from './sat-trades/find-trades-file.mjs';
import { normalizeTrades, loadLocationDisplayNames } from './sat-trades/normalize.mjs';
import { TRADE_ARCHIVE_CONTEXT } from '../js/core/trade-config.mjs';
import { indexTradeEvidence, localTradeEvidence } from '../js/core/trade-potential-evidence.mjs';
const { records } = readTradesFile(findEuropeTradesFile().path);
const snapshot = { ...TRADE_ARCHIVE_CONTEXT, trades: normalizeTrades(records, loadLocationDisplayNames()) };
const index = indexTradeEvidence(snapshot);
const requests = [...index.keys()].map(key => { const [server, city, itemId, quality, side] = JSON.parse(key); return { server, city, itemId, quality, side }; });
const windows = [7, 14, 28, 60, 90].map(days => {
    const stats = requests.map(request => localTradeEvidence(index, request, days, Date.now()));
    return { days, matchedSeries: stats.length, adequateLocalPrice: stats.filter(value => value.priceReliable).length, adequateLocalPriceAndCapacity: stats.filter(value => value.reliable).length };
});
console.log(JSON.stringify({ source: 'personal-europe', records: records.length, qualityKnown: snapshot.trades.filter(trade => trade.quality != null).length, windows }, null, 2));
