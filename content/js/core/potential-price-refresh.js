import { SALE_HORIZONS, SALE_HISTORY_DAYS, saleHorizonTarget, mergePotentialHistory } from './potential-sale-horizon.mjs';
import { readPotentialSnapshots, savePotentialSnapshots } from './potential-price-snapshot.mjs';
import { indexTradeEvidence, tradeCityKey, tradeEvidenceKey } from './trade-potential-evidence.mjs';
import { fetchLocalSalesHistory } from './local-sales-history.js';
import { fetchCachedTradeSnapshot } from './trade-live.js';
import { getServer } from './settings.js';
import { fetchHistoryIndex, historyAt } from './market-history.js';
import { cityRow, fetchGamePrices, indexPrices } from './market.js';
import { DAY_MS } from './market-history-config.mjs';

export async function refreshPotentialPrices(requests, { storage, days = SALE_HORIZONS[0].days, refresh = true, now = Date.now() } = {}) {
    if (requests.some(request => request.server !== getServer().id)) throw new Error('Tahminleri yenilemek için kayıtların sunucusunu seçin.');
    requests = [...new Map(requests.map(request => [tradeEvidenceKey(request), request])).values()];
    const saved = readPotentialSnapshots(storage, requests, days, now);
    const needed = refresh ? requests : requests.filter(request => !saved.has(tradeEvidenceKey(request)));
    if (!needed.length) return saved;
    const snapshot = await fetchCachedTradeSnapshot({ server: getServer().id, days: SALE_HISTORY_DAYS,
        items: [...new Set(needed.map(row => row.itemId))].sort(), locations: [...new Set(needed.map(row => row.city))].sort(),
        qualities: [...new Set(needed.map(row => row.quality))].sort() }, { force: refresh });
    const personal = indexTradeEvidence(snapshot), groups = new Map(), evidence = new Map();
    for (const request of needed) {
        const key = JSON.stringify([request.server, request.city, request.quality]);
        const group = groups.get(key) ?? []; group.push(request); groups.set(key, group);
    }
    for (const group of groups.values()) {
        const ids = [...new Set(group.map(request => request.itemId))], request = group[0];
        const [packet, local] = await Promise.all([
            fetchLocalSalesHistory(ids, request, SALE_HISTORY_DAYS, { packet: true, force: refresh }),
            fetchLocalSalesHistory(ids, request, SALE_HISTORY_DAYS, { force: refresh })]);
        const sources = id => [{ source: 'Oyun Market History', points: packet.get(id)?.points ?? [] },
            { source: 'Yerel AODP', points: local.get(id)?.points ?? [] }];
        // Local sources are always inspected together. A single daily API batch
        // fills gaps; do not repeat hourly and external requests for each horizon.
        const apiIds = ids.filter(id => {
            const merged = mergePotentialHistory(sources(id));
            const end = Math.floor(now / DAY_MS) * DAY_MS, coverage = new Map();
            for (const point of merged) if (Date.parse(point.timestamp) >= end - SALE_HISTORY_DAYS * DAY_MS
                && Date.parse(point.timestamp) < end) {
                const day = point.timestamp.slice(0, 10);
                coverage.set(day, (coverage.get(day) ?? 0) + point.intervalHours);
            }
            return [...coverage.values()].filter(hours => hours >= 24).length < SALE_HISTORY_DAYS;
        });
        const api = apiIds.length ? await fetchHistoryIndex(apiIds, [request.city], {
            days: SALE_HISTORY_DAYS, timeScale: 24, qualities: request.quality, force: refresh, throwOnError: true }) : null;
        for (const entry of group) evidence.set(tradeEvidenceKey(entry), {
            forecastPoints: mergePotentialHistory([...sources(entry.itemId), { source: 'AODP',
                points: historyAt(api, entry.itemId, entry.city, entry.quality)?.points ?? [] }]),
            personalForecastPoints: (personal.get(tradeEvidenceKey({ ...entry, city: tradeCityKey(entry.city) })) ?? [])
                .map(trade => ({ sourceId: trade.sourceId, timestamp: trade.occurredAt, price: Number(trade.unitPriceSilver),
                    quantity: Number(trade.quantity), source: 'Kişisel' })) });
    }
    let orders = new Map();
    try { orders = indexPrices(await fetchGamePrices([...new Set(needed.map(request => request.itemId))],
        [...new Set(needed.map(request => request.city))], { qualities: [...new Set(needed.map(request => request.quality))].join(',') })); }
    catch (error) { console.warn('[Potansiyel fiyat] Güncel emirler alınamadı:', error.message); }
    for (const period of SALE_HORIZONS) {
        const targets = new Map(needed.map(request => {
            const key = tradeEvidenceKey(request), proof = evidence.get(key);
            return [key, saleHorizonTarget(proof, request, cityRow(orders, request.itemId, request.city, request.quality),
                request.side === 'buy' ? SALE_HORIZONS.at(-1).days : period.days, now)];
        }));
        // Purchase evidence stays independent of the selected harvest horizon.
        for (const request of needed) if (request.side === 'buy') targets.get(tradeEvidenceKey(request)).days = period.days;
        savePotentialSnapshots(storage, needed, period.days, targets, now);
        if (period.days === days) for (const [key, value] of targets) saved.set(key, value);
    }
    return saved;
}
