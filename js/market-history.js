import { getServer } from './settings.js';
import { priceIndexKey } from './market.js';

const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const BATCH_SIZE = 24;

function formatApiDate(date) {
    return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

function historyKey(itemId, city, quality = 1) {
    return priceIndexKey(itemId, city, quality);
}

function median(values) {
    if (!values.length) {
        return null;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
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
        medianAvgPrice: median(prices),
        avgItemCount: mean(counts) ?? 0,
        cv: coefficientOfVariation(prices),
        n: prices.length
    };
}

function cacheGet(key) {
    const hit = CACHE.get(key);
    if (!hit) {
        return null;
    }
    if (Date.now() - hit.at > CACHE_TTL_MS) {
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
    const response = await fetch(url);
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
export async function fetchHistoryIndex(itemIds, locations, {
    days = 14,
    timeScale = 24,
    qualities = 1
} = {}) {
    const ids = [...new Set((itemIds || []).filter(Boolean))];
    const cities = [...new Set((locations || []).filter(Boolean))];
    const map = new Map();
    if (!ids.length || !cities.length) {
        return map;
    }

    const end = new Date();
    const start = new Date(end.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const date = formatApiDate(start);
    const endDate = formatApiDate(end);
    const host = getServer().host;
    const cacheBucket = `${host}|${cities.join(',')}|${days}|${timeScale}|${qualities}`;

    const needFetch = [];
    for (const id of ids) {
        let complete = true;
        for (const city of cities) {
            const key = historyKey(id, city);
            const cached = cacheGet(`${cacheBucket}|${key}`);
            if (cached) {
                map.set(key, cached);
            } else {
                complete = false;
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
            rows = await fetchHistoryBatch(host, batch, cities, {
                date,
                endDate,
                timeScale,
                qualities
            });
        } catch (error) {
            console.warn(error);
            continue;
        }

        for (const row of rows) {
            const itemId = row.item_id;
            const city = row.location;
            const quality = Number(row.quality) || 1;
            const summary = summarizeSeries(Array.isArray(row.data) ? row.data : []);
            if (!itemId || !city || !summary) {
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
    }

    return map;
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
