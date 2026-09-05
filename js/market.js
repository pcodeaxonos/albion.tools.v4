import { getServer } from './settings.js';

export async function fetchPrices(itemIds, locations = ['Black Market', 'Caerleon']) {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }

    const server = getServer();
    const params = new URLSearchParams({
        locations: locations.join(','),
        qualities: '1'
    });
    const pathIds = ids.map((id) => encodeURIComponent(id)).join(',');
    const url = `${server.host}/api/v2/stats/prices/${pathIds}?${params}`;
    const response = await fetch(url);

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

export function sellOrderPrice(row) {
    if (!row || !(row.sell_price_min > 0)) {
        return null;
    }
    return {
        price: row.sell_price_min,
        date: isLiveDate(row.sell_price_min_date) ? row.sell_price_min_date : null
    };
}

export function buyOrderPrice(row) {
    if (!row || !(row.buy_price_max > 0)) {
        return null;
    }
    return {
        price: row.buy_price_max,
        date: isLiveDate(row.buy_price_max_date) ? row.buy_price_max_date : null
    };
}

export function cityRow(priceIndex, uniqueName, city) {
    return priceIndex.get(`${uniqueName}|${city}`) ?? null;
}
