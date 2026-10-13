import { getServer } from './settings.js';
import { median } from './market-primitives.mjs';
import { MARKET_COLLECTION_POLICY, HISTORY_CACHE_POLICY, DAY_MS } from './market-history-config.mjs';

const HISTORY_REQUEST_TIMEOUT_MS = 10000;
import { priceIndexKey } from './market.js';

const CACHE = new Map();
const CACHE_TTL_MS = HISTORY_CACHE_POLICY.positiveMs;
const NEGATIVE_CACHE_TTL_MS = HISTORY_CACHE_POLICY.negativeMs;
const IN_FLIGHT = new Map();
const BATCH_SIZE = 24;
const REQUEST_GAP_MS = Math.ceil(Math.max(
    60000 / (MARKET_COLLECTION_POLICY.rateLimitPerMinute * MARKET_COLLECTION_POLICY.budgetRatio),
    300000 / (MARKET_COLLECTION_POLICY.rateLimitPerFiveMin * MARKET_COLLECTION_POLICY.budgetRatio)
));
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
function scheduledRequest(run) {
    const job = requestQueue.then(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, nextRequestAt - Date.now())));
        nextRequestAt = Date.now() + REQUEST_GAP_MS;
        return run();
    });
    requestQueue = job.catch(() => {});
    return job;
}

function formatApiDate(date) {
    return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

function historyKey(itemId, city, quality = 1) {
    return priceIndexKey(itemId, city, quality);
}

function mean(values) {
    if (!values.length) {
        return null;
    }
    return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function coefficientOfVariation(values) {
    if (values.length < 2) {
        return 0;
    }
    const avg = mean(values);
    if (!(avg > 0)) {
        return 0;
    }
    const variance = values.reduce((sum, n) => sum + ((n - avg) ** 2), 0) / values.length;
    return Math.sqrt(variance) / avg;
}

function summarizeSeries(points) {
    const prices = points.map((p) => Number(p.avg_price)).filter((n) => n > 0);
    const counts = points.map((p) => Number(p.item_count)).filter((n) => Number.isFinite(n) && n >= 0);
    if (!prices.length) {
        return null;
    }
    return {
        meanAvgPrice: mean(prices),
        medianAvgPrice: median(prices),
        avgItemCount: mean(counts) ?? 0,
        cv: coefficientOfVariation(prices),
        n: prices.length,
        points: points.map(point => ({ timestamp: point.timestamp, avg_price: point.avg_price, item_count: point.item_count }))
    };
}

function cacheGet(key) {
    const hit = CACHE.get(key);
    if (!hit) {
        return null;
    }
    if (Date.now() - hit.at > (hit.value?.empty ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS)) {
        CACHE.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    CACHE.set(key, { at: Date.now(), value });
}

async function fetchHistoryBatch(host, ids, locations, { date, endDate, timeScale, qualities }) {
    const params = new URLSearchParams({
        locations: locations.join(','),
        qualities: String(qualities || 1),
        'time-scale': String(timeScale || 24),
        date,
        end_date: endDate
    });
    const pathIds = ids.map((id) => encodeURIComponent(id)).join(',');
    const url = `${host}/api/v2/stats/history/${pathIds}.json?${params}`;
    const response = await fetch(url, {
        signal: AbortSignal.timeout(HISTORY_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
        throw new Error(`Geçmiş fiyat alınamadı (${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

/**
 * Fetch daily sell-history stats and index by item|city|quality.
 * @returns {Map<string, { medianAvgPrice: number, avgItemCount: number, cv: number, n: number }>}
 */
async function loadHistoryIndex(itemIds, locations, {
    days = 14,
    timeScale = 24,
    force = false,
    qualities = 1,
    throwOnError = false
} = {}) {
    const ids = [...new Set((itemIds || []).filter(Boolean))];
    const cities = [...new Set((locations || []).filter(Boolean))].sort();
    const qualityValues = String(qualities).split(',').map(Number).filter(value => Number.isInteger(value) && value > 0);
    const map = new Map();
    if (!ids.length || !cities.length) {
        return map;
    }

    const end = new Date();
    const start = new Date(end.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const date = formatApiDate(start);
    const endDate = formatApiDate(end);
    const host = getServer().host;
    const cacheBucket = `${host}|${cities.join(',')}|${days}|${timeScale}|${qualities}|${Math.floor(Date.now() / DAY_MS)}`;

    const needFetch = [];
    for (const id of ids) {
        let complete = true;
        for (const city of cities) {
            for (const quality of qualityValues) {
                const key = historyKey(id, city, quality);
                const cached = force ? null : cacheGet(`${cacheBucket}|${key}`);
                if (cached) {
                    if (!cached.empty) map.set(key, cached);
                } else {
                    complete = false;
                }
            }
        }
        if (!complete) {
            needFetch.push(id);
        }
    }

    if (!needFetch.length) {
        return map;
    }

    for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
        const batch = needFetch.slice(i, i + BATCH_SIZE);
        let rows = [];
        try {
            rows = await scheduledRequest(() => fetchHistoryBatch(host, batch, cities, {
                date,
                endDate,
                timeScale,
                qualities
            }));
        } catch (error) {
            if (throwOnError) throw error;
            console.warn(error);
            continue;
        }

        for (const row of rows) {
            const itemId = row.item_id;
            const city = row.location;
            const quality = Number(row.quality);
            const summary = summarizeSeries(Array.isArray(row.data) ? row.data : []);
            if (!batch.includes(itemId) || !cities.includes(city) || row.quality == null || !qualityValues.includes(quality) || !summary) {
                continue;
            }
            const key = historyKey(itemId, city, quality);
            map.set(key, summary);
            cacheSet(`${cacheBucket}|${key}`, summary);
            if (quality === 1) {
                map.set(`${itemId}|${city}`, summary);
                cacheSet(`${cacheBucket}|${itemId}|${city}`, summary);
            }
        }
        for (const id of batch) for (const city of cities) for (const quality of qualityValues) {
            const key = historyKey(id, city, quality);
            if (!map.has(key)) cacheSet(`${cacheBucket}|${key}`, { empty: true });
        }
    }

    return map;
}

export function fetchHistoryIndex(itemIds, locations, options = {}) {
    const ids = [...new Set((itemIds || []).filter(Boolean))].sort();
    const cities = [...new Set((locations || []).filter(Boolean))].sort();
    const normalized = { force: options.force === true, days: options.days ?? 14, timeScale: options.timeScale ?? 24,
        qualities: String(options.qualities ?? 1).split(',').map(Number).sort((a, b) => a - b).join(','), throwOnError: options.throwOnError === true };
    const key = JSON.stringify([getServer().host, ids, cities, normalized, Math.floor(Date.now() / DAY_MS)]);
    if (!IN_FLIGHT.has(key)) {
        const pending = loadHistoryIndex(ids, cities, normalized).finally(() => IN_FLIGHT.delete(key));
        IN_FLIGHT.set(key, pending);
    }
    return IN_FLIGHT.get(key);
}

export function historyAt(historyIndex, itemId, city, quality = 1) {
    if (!historyIndex || !itemId || !city) {
        return null;
    }
    const q = Number(quality) || 1;
    return historyIndex.get(historyKey(itemId, city, q))
        ?? (q === 1 ? historyIndex.get(`${itemId}|${city}`) : null)
        ?? null;
}
