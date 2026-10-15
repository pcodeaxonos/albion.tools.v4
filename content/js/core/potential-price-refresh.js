import { SALE_HORIZONS, SALE_HISTORY_DAYS, saleHorizonTarget } from './potential-sale-horizon.mjs';
import { includePotentialOrder } from './potential-order-candidate.mjs';
import { readPotentialSnapshots, savePotentialSnapshots } from './potential-price-snapshot.mjs';
import { resolveTradePotential, tradeEvidenceKey } from './trade-potential-evidence.mjs';
import { fetchLocalSalesHistory } from './local-sales-history.js';
import { fetchCachedTradeSnapshot } from './trade-live.js';
import { getServer } from './settings.js';
import { fetchHistoryIndex, historyAt } from './market-history.js';
import { cityRow, fetchGamePrices, indexPrices } from './market.js';

export async function refreshPotentialPrices(requests, { storage, days = SALE_HORIZONS[0].days, refresh = true } = {}) {
    const historyDays = SALE_HISTORY_DAYS;
    if (requests.some(request => request.server !== getServer().id)) throw new Error("Tahminleri yenilemek için kayıtların sunucusunu seçin.");
    requests = [...new Map(requests.map(request => [tradeEvidenceKey(request), request])).values()];
    if (!requests.length) return new Map();
    const saved = readPotentialSnapshots(storage, requests, days);
    const needed = refresh ? requests : requests.filter(request => !saved.has(tradeEvidenceKey(request)));
    if (!needed.length) return saved;
    let snapshot;
    try { snapshot = await fetchCachedTradeSnapshot({ server: getServer().id, days: historyDays,
        items: [...new Set(requests.map(row => row.itemId))].sort(),
        locations: [...new Set(requests.map(row => row.city))].sort(), qualities: [...new Set(requests.map(row => row.quality))].sort() }, { force: refresh }); }
    catch (error) { snapshot = { trades: [], error: error.message }; }
    const selected = await resolveTradePotential(needed, { snapshot, days: historyDays, opportunity: true, priceOnly: true,
        fetchHourlyHistory: async (ids, request) => {
            const index = await fetchHistoryIndex(ids, [request.city], { days: historyDays, timeScale: 1, qualities: request.quality, force: refresh });
            return new Map(ids.map(id => [id, { points: historyAt(index, id, request.city, request.quality)?.points ?? [] }]));
        },
        fetchPacketHistory: (ids, request) => fetchLocalSalesHistory(ids, request, historyDays, { packet: true, force: refresh }),
        fetchLocalHistory: (ids, request) => fetchLocalSalesHistory(ids, request, historyDays, { force: refresh }),
        fetchHistory: (ids, request) => fetchLocalSalesHistory(ids, request, historyDays, { external: true, force: refresh }) });
    const needsHistory = (evidence, request) => SALE_HORIZONS.some(period => !saleHorizonTarget(evidence, request, null, period.days).reliable);
    const forecastRequests = needed.filter(request => request.side === 'sell'
        && needsHistory(selected.get(tradeEvidenceKey(request)), request));
    const forecastGroups = new Map();
    for (const request of forecastRequests) { const key = request.city + '|' + request.quality; if (!forecastGroups.has(key)) forecastGroups.set(key, []); forecastGroups.get(key).push(request); }
    for (const group of forecastGroups.values()) {
        const ids = group.map(request => request.itemId);
        let packet = new Map(), local = new Map(), api = null;
        try { packet = await fetchLocalSalesHistory(ids, group[0], historyDays, {packet:true,force:refresh}); } catch {}
        try { local = await fetchLocalSalesHistory(ids, group[0], historyDays, {force:refresh}); } catch {}
        const apiIds = group.filter(request => needsHistory({ forecastPoints:
            [...(local.get(request.itemId)?.points ?? []), ...(packet.get(request.itemId)?.points ?? [])]
                .map(point => ({ timestamp: point.timestamp, price: Number(point.avg_price), quantity: Number(point.item_count) }))
        }, request)).map(request => request.itemId);
        if (apiIds.length) api = await fetchHistoryIndex(apiIds,[group[0].city],{days:historyDays,timeScale:24,qualities:group[0].quality,force:refresh,throwOnError:true});
        for (const request of group) {
            const value = selected.get(tradeEvidenceKey(request));
            const daily = new Map();
            // Fine/local/personal evidence overrides external daily averages.
            for (const points of [historyAt(api,request.itemId,request.city,request.quality)?.points ?? [], local.get(request.itemId)?.points ?? [], packet.get(request.itemId)?.points ?? [], value?.forecastPoints ?? []]) {
                const grouped = new Map();
                for (const point of points) { const key = point.timestamp?.slice(0,10); if (!key) continue; if (!grouped.has(key)) grouped.set(key,[]); grouped.get(key).push({timestamp:point.timestamp,price:point.price ?? Number(point.avg_price),quantity:point.quantity ?? Number(point.item_count)}); }
                for (const [day, list] of grouped) daily.set(day,list);
            }
            if (value) selected.set(tradeEvidenceKey(request),{...value,forecastPoints:[...daily.values()].flat(),forecastSource:'Şahsi/oyun/yerel öncelikli, eksik günlerde API geçmişi'});
        }
    }
    const horizonEvidence = new Map(selected);
    let currentOrders = new Map();
    try {
        const rows = await fetchGamePrices([...new Set(needed.map(request => request.itemId))], [...new Set(needed.map(request => request.city))], { qualities: [...new Set(needed.map(request => request.quality))].join(',') });
        const index = indexPrices(rows);
        currentOrders = index;
        for (const request of needed) {
            const key = tradeEvidenceKey(request);
            const evidence = selected.get(key);
            const row = cityRow(index, request.itemId, request.city, request.quality);
            selected.set(key, request.side === 'sell' ? saleHorizonTarget(evidence, request, row, days) : { ...includePotentialOrder(evidence, request, row, historyDays), days });
        }
    } catch (error) {
        console.warn('[Island Planner V2] Güncel oyun emirleri alınamadı; geçmiş kanıtı korunuyor.', error.message);
        for (const request of needed) { const key = tradeEvidenceKey(request), evidence = selected.get(key); selected.set(key, request.side === 'sell' ? saleHorizonTarget(evidence, request, null, days) : { ...evidence, days }); }
    }
    // Freeze every sale horizon from the same evidence and order-book snapshot.
    for (const period of SALE_HORIZONS) {
        const targets = new Map(needed.map(request => {
            const key = tradeEvidenceKey(request);
            const value = request.side === 'sell' ? saleHorizonTarget(horizonEvidence.get(key), request, cityRow(currentOrders, request.itemId, request.city, request.quality), period.days)
                : { ...selected.get(key), days: period.days };
            return [key, value];
        }));
        savePotentialSnapshots(storage, needed, period.days, targets);
        if (period.days === days) for (const [key, value] of targets) selected.set(key, value);
    }
    for (const [key, value] of selected) saved.set(key, value);
    return saved;
}
