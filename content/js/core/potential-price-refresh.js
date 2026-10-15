import { SALE_HORIZONS, SALE_HISTORY_DAYS, saleHorizonTarget, mergePotentialHistory } from './potential-sale-horizon.mjs';
import { readPotentialSnapshots, savePotentialSnapshots } from './potential-price-snapshot.mjs';
import { indexTradeEvidence, tradeCityKey, tradeEvidenceKey } from './trade-potential-evidence.mjs';
import { fetchLocalSalesHistory } from './local-sales-history.js';
import { fetchCachedTradeSnapshot } from './trade-live.js';
import { getServer } from './settings.js';
import { fetchHistoryIndex, historyAt } from './market-history.js';
import { cityRow, fetchGamePrices, indexPrices } from './market.js';
import { DAY_MS } from './market-history-config.mjs';

export async function refreshPotentialPrices(requests, { storage, days = SALE_HORIZONS[0].days, refresh = true, archiveOnly = false, now = Date.now() } = {}) {
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
        const apiIds = archiveOnly ? [] : ids.filter(id => {
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
                .map(trade => ({ sourceId: trade.sourceId, orderId: trade.orderId, kind: trade.kind, characterGuid: trade.characterGuid,
                    orderCreatedAt: trade.orderCreatedAt, orderCompletedAt: trade.orderCompletedAt,
                    timestamp: trade.occurredAt, price: Number(trade.unitPriceSilver),
                    quantity: Number(trade.quantity), source: 'Kişisel' })) });
    }
    let orders = new Map();
    try { if (!archiveOnly) orders = indexPrices(await fetchGamePrices([...new Set(needed.map(request => request.itemId))],
        [...new Set(needed.map(request => request.city))], { qualities: [...new Set(needed.map(request => request.quality))].join(',') })); }
    catch (error) { console.warn('[Potansiyel fiyat] Güncel emirler alınamadı:', error.message); }
    const purchases = new Map();
    for (const period of SALE_HORIZONS) {
        const targets = new Map(needed.map(request => {
            const key = tradeEvidenceKey(request), proof = evidence.get(key);
            const target = purchases.get(key) ?? saleHorizonTarget(proof, request, cityRow(orders, request.itemId, request.city, request.quality),
                request.side === 'buy' ? SALE_HORIZONS.at(-1).days : period.days, now);
            if (request.side === 'buy') purchases.set(key, target);
            return [key, { ...target }];
        }));
        // Purchase evidence stays independent of the selected harvest horizon.
        for (const request of needed) if (request.side === 'buy') targets.get(tradeEvidenceKey(request)).days = period.days;
        savePotentialSnapshots(storage, needed, period.days, targets, now);
        if (period.days === days) for (const [key, value] of targets) saved.set(key, value);
    }
    return saved;
}

// Freeze the complete filtered selection before statuses change. Checkpoint each
// market independently, so a failed transport/write leaves that market intact.
export async function refreshPotentialPriceBatch(rows, { storage, commit, onProgress = () => {}, ...options } = {}) {
    const groups = new Map();
    for (const row of rows) {
        const key = JSON.stringify([row.server, row.city, row.quality]);
        const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
    }
    const progress = { total: rows.length, completed: 0, success: 0, errors: 0, remaining: rows.length, failures: [] };
    onProgress({ ...progress });
    for (const group of groups.values()) {
        const changes = new Map();
        const staged = { getItem: key => changes.get(key) ?? storage.getItem(key), setItem: (key, value) => changes.set(key, value) };
        try {
            await refreshPotentialPrices(group.map(row => ({ ...row, side: row.side.toLowerCase() })), { ...options, storage: staged });
            await commit(changes);
            progress.success += group.length;
        } catch (error) {
            progress.errors += group.length;
            progress.failures.push({ server: group[0].server, city: group[0].city, count: group.length, reason: error.message });
        }
        progress.completed += group.length;
        progress.remaining = progress.total - progress.completed;
        onProgress({ ...progress, failures: [...progress.failures] });
    }
    return progress;
}
