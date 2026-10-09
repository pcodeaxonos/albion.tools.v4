import { AODP_COLLECTOR_POLICY } from './market-history-config.mjs';

export function aodpUrl(host, endpoint, ids, cities, quality, params = {}) {
    const query = new URLSearchParams({ locations: cities.join(','), qualities: String(quality), ...params });
    return `${host}/api/v2/stats/${endpoint}/${ids.map(encodeURIComponent).join(',')}.json?${query}`;
}

/** Pack by the final encoded URL, not a fixed item count. Shared by hub and browser. */
export function urlBatches(ids, makeUrl, limit = AODP_COLLECTOR_POLICY.maxUrlLength) {
    const batches = []; let batch = [];
    for (const id of [...new Set(ids)]) {
        if (makeUrl([id]).length > limit) throw new Error(`Market item exceeds URL limit: ${id}`);
        if (batch.length && makeUrl([...batch, id]).length > limit) { batches.push(batch); batch = []; }
        batch.push(id);
    }
    if (batch.length) batches.push(batch);
    return batches;
}
