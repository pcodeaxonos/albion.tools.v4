import { localPriceHost } from './settings.js';
import { urlBatches } from './market-request.mjs';
import { SALES_HISTORY_ENDPOINT, PACKET_HISTORY_ENDPOINT, HISTORY_CACHE_POLICY, DAY_MS } from './market-history-config.mjs';

const cache = new Map(), pending = new Map();
export async function fetchLocalSalesHistory(items, request, days, { external = false, force = false, packet = false } = {}) {
    const ids = [...new Set(items)].sort();
    const key = JSON.stringify([localPriceHost(), request.server, request.city, request.quality, days, ids, external, packet, Math.floor(Date.now() / DAY_MS)]);
    const hit = cache.get(key);
    if (!force && hit && Date.now() < hit.expires) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
        const makeUrl = batch => `${localPriceHost()}${packet ? PACKET_HISTORY_ENDPOINT : SALES_HISTORY_ENDPOINT}?${new URLSearchParams({
            server: request.server, locations: request.city, qualities: String(request.quality), days: String(days), items: batch.join(','),
            ...(external ? { external: '1' } : {}) })}`;
        const result = new Map();
        for (const batch of urlBatches(ids, makeUrl)) {
            const response = await fetch(makeUrl(batch), { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error(`Yerel satış arşivi alınamadı (${response.status})`);
            const payload = await response.json();
            if (payload.server !== request.server) throw new Error('Yerel satış arşivi server uyuşmazlığı');
            for (const row of payload.rows ?? []) if (ids.includes(row.item_id) && row.server === request.server
                && row.location === request.city && row.quality === request.quality) result.set(row.item_id, { points: row.data });
        }
        const ttl = external ? ([...result.values()].some(row => row.points?.length) ? HISTORY_CACHE_POLICY.positiveMs : HISTORY_CACHE_POLICY.negativeMs) : HISTORY_CACHE_POLICY.localMs;
        cache.set(key, { value: result, expires: Date.now() + ttl });
        return result;
    })().finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
}
