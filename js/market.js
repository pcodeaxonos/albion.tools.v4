import { getPriceHost, getSettings, getServer, localPriceHost } from './settings.js';
import { isStalePriceDate } from './price-side.js';

function hostForSource(source) {
    if (source === 'api') {
        return getServer().host;
    }
    if (source === 'packets') {
        return localPriceHost();
    }
    return getPriceHost();
}

export function priceLoaderMessage(source, fallback = 'Fiyatlar alınıyor…') {
    return source === 'api' ? 'AODP fiyatları alınıyor…' : fallback;
}

export function priceRefreshActionsHtml({ refreshId, apiId }) {
    return `
        <div class="tool-price-actions">
            <button type="button" class="btn btn-outline-secondary" id="${refreshId}">Fiyatları yenile</button>
            <button type="button" class="btn btn-outline-secondary" id="${apiId}" title="AODP’deki fiyatları çeker. Eksik kalanlar için oyunda marketi aç.">Fiyatları API’den çek</button>
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

export async function fetchPrices(itemIds, locations = ['Black Market', 'Caerleon'], { source } = {}) {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }

    const params = new URLSearchParams({
        locations: locations.join(','),
        qualities: '1'
    });
    const pathIds = ids.map((id) => encodeURIComponent(id)).join(',');
    const host = hostForSource(source);
    const url = `${host}/api/v2/stats/prices/${pathIds}?${params}`;

    let response;
    try {
        response = await fetch(url);
    } catch {
        if ((source ?? getSettings().priceSource) === 'packets') {
            throw new Error('Yerel paket sunucusu kapalı. start.bat ile açın veya Ayarlar’dan API’ye dönün.');
        }
        throw new Error('Fiyat alınamadı (ağ hatası)');
    }

    if (!response.ok) {
        throw new Error(`Fiyat alınamadı (${response.status})`);
    }

    return response.json();
}

export function indexPrices(rows) {
    const map = new Map();
    for (const row of rows) {
        map.set(`${row.item_id}|${row.city}`, row);
    }
    return map;
}

function isLiveDate(value) {
    return Boolean(value) && !String(value).startsWith('0001');
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

export function cityRow(priceIndex, uniqueName, city) {
    return priceIndex.get(`${uniqueName}|${city}`) ?? null;
}
