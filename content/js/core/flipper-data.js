import { fetchPrices } from './market.js';
import { fetchLongTermIndex } from './long-term-quotes.js';
import { marketSeriesKey } from './market-primitives.mjs';
import { aodpUrl, urlBatches } from './market-request.mjs';
import { getServer } from './settings.js';
import { evaluateFlip } from './flipper.mjs';
export async function scanFlips({ items, sources, target, targets = target ? [target] : [], quality, fees, transport, maxAgeMs, signal, onProgress }) {
    const server = getServer();
    const destinations = [...new Set(targets)];
    const cities = [...new Set([...sources, ...destinations])];
    const batches = urlBatches(items.map(item => item.uniqueName), ids => aodpUrl(server.host, 'prices', ids, cities, quality));
    const catalog = new Map(items.map(item => [item.uniqueName, item]));
    const prices = []; let completed = 0, failed = 0;
    // Bounded requests use the existing preferred-source and fallback rules.
    for (const ids of batches) {
        signal.throwIfAborted();
        try { prices.push(...await fetchPrices(ids, cities, { qualities: quality, signal })); }
        catch (error) { signal.throwIfAborted(); failed++; }
        onProgress?.(++completed, batches.length);
    }
    if (!prices.length) throw new Error('Fiyat kaynağına ulaşılamadı veya seçime uygun fiyat yok');
    const candidateIds = [...new Set(prices.map(row => row.item_id))];
    let references = new Map(), historyError = '';
    if (String(quality).split(',').includes('1')) {
        try { references = await fetchLongTermIndex(candidateIds, cities, { signal }); }
        catch { signal.throwIfAborted(); historyError = 'Fiyat arşivi alınamadı; uç fiyat kontrolü sınırlı.'; }
        if (String(quality) !== '1' && !historyError) historyError = 'Normal dışındaki kaliteler için tarihsel kontrol yok.';
    } else historyError = 'Ortak arşiv normal kaliteyi izliyor; bu kalite için tarihsel kontrol yok.';
    if (getServer().id !== server.id) throw new Error('Sunucu değişti; yeniden tarayın');
    const destinationIndex = new Map(prices.filter(row => destinations.includes(row.city)).map(row => [`${row.item_id}|${row.quality}|${row.city}`, row]));
    const reference = (row, side) => references.get(marketSeriesKey({ server: server.id, itemId: row.item_id, city: row.city, quality: row.quality, side }));
    const rows = prices.filter(row => sources.includes(row.city)).flatMap(source => destinations.map(city => {
        const dest = destinationIndex.get(`${source.item_id}|${source.quality}|${city}`);
        return dest && evaluateFlip({ item: catalog.get(source.item_id), source, target: dest, sourceReference: reference(source,'sell'), targetReference: reference(dest,'buy'), taxRate: fees.taxRate, transport, maxAgeMs });
    })).filter(Boolean).sort((a,b) => b.score-a.score);
    return { rows, failed, historyError, fetchedAt: new Date().toISOString(), server: server.id };
}
