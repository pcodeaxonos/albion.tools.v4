import { getSettings, getServer, localPriceHost } from './settings.js';
import { isStalePriceDate } from './price-side.js';

export function priceLoaderMessage(source, fallback = 'Fiyatlar alınıyor…') {
    if (source === 'api') {
        return 'AODP fiyatları alınıyor (oyun verisiyle birleştirilecek)…';
    }
    return fallback;
}

export function priceRefreshActionsHtml({ refreshId, apiId }) {
    return `
        <div class="tool-price-actions">
            <button type="button" class="btn btn-outline-secondary" id="${refreshId}" title="Önce oyun (paket) verisi, yoksa veya daha eskiyse AODP ile birleştirir.">Fiyatları yenile</button>
            <button type="button" class="btn btn-outline-secondary" id="${apiId}" title="AODP’yi yeniden çeker; oyun verisi varsa güncel olan kazanır. Eksikler için oyunda marketi aç.">Fiyatları API’den çek</button>
        </div>
    `;
}

export function applyPriceLoadMode(state, { source, showLoader = true } = {}) {
    if (source === 'api') {
        state.livePaused = true;
        return;
    }
    if (showLoader) {
        state.livePaused = false;
    }
}

export function bindPriceRefresh(container, { refreshId, apiId, load }) {
    container.querySelector(`#${refreshId}`)?.addEventListener('click', () => {
        load();
    });
    container.querySelector(`#${apiId}`)?.addEventListener('click', () => {
        load({ source: 'api' });
    });
}

function isLiveDate(value) {
    return Boolean(value) && !String(value).startsWith('0001');
}

function dateStamp(value) {
    if (!isLiveDate(value)) {
        return 0;
    }
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? stamp : 0;
}

function hasSell(row) {
    return row && row.sell_price_min > 0;
}

function hasBuy(row) {
    return row && row.buy_price_max > 0;
}

/**
 * Prefer game (packets) when only one side has data; if both have data, newer date wins.
 * Sell and buy sides are picked independently on the merged row.
 */
export function mergePriceRows(gameRows = [], apiRows = []) {
    const byKey = new Map();

    const touch = (row, origin) => {
        if (!row?.item_id || !row?.city) {
            return;
        }
        const quality = priceQuality(row);
        const key = priceIndexKey(row.item_id, row.city, quality);
        const prev = byKey.get(key) || {
            item_id: row.item_id,
            city: row.city,
            quality,
            sell_price_min: 0,
            sell_price_min_date: null,
            buy_price_max: 0,
            buy_price_max_date: null,
            _sellOrigin: null,
            _buyOrigin: null
        };

        if (hasSell(row)) {
            const incomingStamp = dateStamp(row.sell_price_min_date);
            const keepStamp = dateStamp(prev.sell_price_min_date);
            const take = !hasSell(prev)
                || (incomingStamp > keepStamp)
                || (incomingStamp === keepStamp && origin === 'game' && prev._sellOrigin !== 'game');
            if (take) {
                prev.sell_price_min = row.sell_price_min;
                prev.sell_price_min_date = row.sell_price_min_date;
                prev._sellOrigin = origin;
            }
        }

        if (hasBuy(row)) {
            const incomingStamp = dateStamp(row.buy_price_max_date);
            const keepStamp = dateStamp(prev.buy_price_max_date);
            const take = !hasBuy(prev)
                || (incomingStamp > keepStamp)
                || (incomingStamp === keepStamp && origin === 'game' && prev._buyOrigin !== 'game');
            if (take) {
                prev.buy_price_max = row.buy_price_max;
                prev.buy_price_max_date = row.buy_price_max_date;
                prev._buyOrigin = origin;
            }
        }

        byKey.set(key, prev);
    };

    // Seed with game first so ties prefer game; API then only wins when newer/missing.
    for (const row of gameRows) {
        touch(row, 'game');
    }
    for (const row of apiRows) {
        touch(row, 'api');
    }

    return [...byKey.values()].map((row) => {
        const { _sellOrigin, _buyOrigin, ...rest } = row;
        return rest;
    });
}

async function fetchPricesFromHost(host, ids, locations, qualityParam) {
    const params = new URLSearchParams({
        locations: locations.join(','),
        qualities: qualityParam || '1'
    });
    const pathIds = ids.map((id) => encodeURIComponent(id)).join(',');
    const url = `${host}/api/v2/stats/prices/${pathIds}?${params}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Fiyat alınamadı (${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchPricesQuiet(host, ids, locations, qualityParam) {
    try {
        return await fetchPricesFromHost(host, ids, locations, qualityParam);
    } catch {
        return [];
    }
}

/**
 * Loads prices from game packets hub and AODP, then merges.
 * Missing side falls back to the other source; when both exist, newer date wins (tie → game).
 */
export async function fetchPrices(itemIds, locations = ['Black Market', 'Caerleon'], { source, qualities = '1' } = {}) {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }

    const qualityParam = Array.isArray(qualities)
        ? [...new Set(qualities.map(Number).filter((q) => q >= 1 && q <= 5))].join(',')
        : String(qualities || '1');

    const gameHost = localPriceHost();
    const apiHost = getServer().host;

    const [gameRows, apiRows] = await Promise.all([
        fetchPricesQuiet(gameHost, ids, locations, qualityParam),
        fetchPricesQuiet(apiHost, ids, locations, qualityParam)
    ]);

    if (gameRows.length === 0 && apiRows.length === 0) {
        const preferred = source ?? getSettings().priceSource;
        if (preferred === 'packets') {
            throw new Error('Yerel paket sunucusu kapalı ve AODP’den fiyat alınamadı. start.bat ile açın veya ağı kontrol edin.');
        }
        throw new Error('Fiyat alınamadı (oyun hub ve AODP)');
    }

    return mergePriceRows(gameRows, apiRows);
}

function priceQuality(row) {
    const quality = Number(row?.quality);
    return Number.isFinite(quality) && quality >= 1 ? quality : 1;
}

export function priceIndexKey(uniqueName, city, quality = 1) {
    return `${uniqueName}|${city}|${Number(quality) || 1}`;
}

export function indexPrices(rows) {
    const map = new Map();
    for (const row of rows) {
        const quality = priceQuality(row);
        map.set(priceIndexKey(row.item_id, row.city, quality), row);
        // Backward-compatible alias for quality 1 callers that used item|city
        if (quality === 1) {
            map.set(`${row.item_id}|${row.city}`, row);
        }
    }
    return map;
}

function datedPrice(price, date) {
    const live = isLiveDate(date) ? date : null;
    return {
        price,
        date: live,
        stale: isStalePriceDate(live)
    };
}

export function sellOrderPrice(row) {
    if (!row || !(row.sell_price_min > 0)) {
        return null;
    }
    return datedPrice(row.sell_price_min, row.sell_price_min_date);
}

export function buyOrderPrice(row) {
    if (!row || !(row.buy_price_max > 0)) {
        return null;
    }
    return datedPrice(row.buy_price_max, row.buy_price_max_date);
}

export function cityRow(priceIndex, uniqueName, city, quality = 1) {
    const q = Number(quality) || 1;
    return priceIndex.get(priceIndexKey(uniqueName, city, q))
        ?? (q === 1 ? priceIndex.get(`${uniqueName}|${city}`) : null)
        ?? null;
}
