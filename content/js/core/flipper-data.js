import { fetchPrices } from './market.js';
import { fetchLongTermIndex } from './long-term-quotes.js';
import { marketSeriesKey } from './market-primitives.mjs';
import { aodpUrl, urlBatches } from './market-request.mjs';
import { getServer, getSettings, localPriceHost } from './settings.js';
import { evaluateFlip } from './flipper.mjs';
export const FLIPPER_SCAN_TTL_MS = 10 * 60 * 1000;
const scanDataCache = new Map();
export async function scanFlips({ items, sources, target, targets = target ? [target] : [], quality, fees, transport, maxAgeMs, signal, onProgress, reuseRecent = true }) {
    const server = getServer();
    const destinations = [...new Set(targets)];
    const cities = [...new Set([...sources, ...destinations])];
    const batches = urlBatches(items.map(item => item.uniqueName), ids => aodpUrl(server.host, 'prices', ids, cities, quality));
    const catalog = new Map(items.map(item => [item.uniqueName, item]));
    const cacheKey = JSON.stringify([server.id, getSettings().priceSource, localPriceHost(), [...catalog.keys()].sort(), [...cities].sort(), String(quality)]);
    const now = Date.now();
    for (const [key, entry] of scanDataCache) if (now - entry.at >= FLIPPER_SCAN_TTL_MS) scanDataCache.delete(key);
    const cached = reuseRecent ? scanDataCache.get(cacheKey) : null;
    const prices = cached ? cached.prices : []; let completed = 0, failed = 0;
    // Bounded requests use the existing preferred-source and fallback rules.
    for (const ids of cached ? [] : batches) {
        signal.throwIfAborted();
        try { prices.push(...await fetchPrices(ids, cities, { qualities: quality, signal })); }
        catch (error) { signal.throwIfAborted(); failed++; }
        onProgress?.(++completed, batches.length);
    }
    if (!prices.length) throw new Error('Fiyat kaynağına ulaşılamadı veya seçime uygun fiyat yok');
    const candidateIds = [...new Set(prices.map(row => row.item_id))];
    let references = cached ? cached.references : new Map(), historyError = cached?.historyError || '';
    if (cached) onProgress?.(batches.length, batches.length);
    else if (String(quality).split(',').includes('1')) {
        try { references = await fetchLongTermIndex(candidateIds, cities, { signal }); }
        catch { signal.throwIfAborted(); historyError = 'Fiyat arşivi alınamadı; uç fiyat kontrolü sınırlı.'; }
        if (String(quality) !== '1' && !historyError) historyError = 'Normal dışındaki kaliteler için tarihsel kontrol yok.';
    } else historyError = 'Ortak arşiv normal kaliteyi izliyor; bu kalite için tarihsel kontrol yok.';
    if (getServer().id !== server.id) throw new Error('Sunucu değişti; yeniden tarayın');
    signal.throwIfAborted();
    const fetchedAt = cached?.fetchedAt || new Date().toISOString();
    if (!cached && !failed && reuseRecent) {
        if (scanDataCache.size >= 8) scanDataCache.delete(scanDataCache.keys().next().value);
        scanDataCache.set(cacheKey, { prices, references, historyError, at: Date.now(), fetchedAt });
    }
    if (!reuseRecent) {
        // Fresh packet observations replace matching records in every retained scan.
        const fresh = new Map(prices.map(row => [JSON.stringify([row.item_id, row.city, row.quality]), row]));
        for (const [key, entry] of scanDataCache) {
            if (JSON.parse(key).slice(0, 3).join('|') !== [server.id, getSettings().priceSource, localPriceHost()].join('|')) continue;
            entry.prices = entry.prices.map(row => fresh.get(JSON.stringify([row.item_id, row.city, row.quality])) || row);
        }
    }
    const destinationIndex = new Map(prices.filter(row => destinations.includes(row.city)).map(row => [`${row.item_id}|${row.quality}|${row.city}`, row]));
    const reference = (row, side) => references.get(marketSeriesKey({ server: server.id, itemId: row.item_id, city: row.city, quality: row.quality, side }));
    const rows = prices.filter(row => sources.includes(row.city)).flatMap(source => destinations.map(city => {
        const dest = destinationIndex.get(`${source.item_id}|${source.quality}|${city}`);
        return dest && evaluateFlip({ item: catalog.get(source.item_id), source, target: dest, sourceReference: reference(source,'sell'), targetReference: reference(dest,'buy'), taxRate: fees.taxRate, transport, maxAgeMs });
    })).filter(Boolean).sort((a,b) => b.score-a.score);
    return { rows, failed, historyError, fetchedAt, server: server.id, reused: Boolean(cached) };
}
