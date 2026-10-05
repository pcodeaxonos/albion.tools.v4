/** Shared browser/Node primitives; no settings or DOM dependencies. */
export function normalizePriceDate(value) {
    // AODP omits the UTC suffix; packet timestamps already carry their offset.
    if (!value || String(value).startsWith('0001')) return null;
    const date = String(value);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(date) ? `${date}Z` : date;
}

export function priceIndexKey(itemId, city, quality = 1) {
    return `${itemId}|${city}|${Number(quality) || 1}`;
}

export function marketSeriesKey({ server, itemId, city, quality, side }) {
    return `${server}|${priceIndexKey(itemId, city, quality)}|${side}`;
}

export const BOOK_PRICE_FIELDS = Object.freeze({ buy: 'buy_price_max', sell: 'sell_price_min' });

export function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
