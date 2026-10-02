import { quoteFromRow, PRICE_STALE_MS } from '../price-side.js';
import { cityRow } from '../market.js';

export const overrideKey = (server, item, city, side, intent) => JSON.stringify([server, item, city, side, intent]);

export function resolvePrice({ index, item, city, side, intent, override, now = Date.now() }) {
    if (override != null && override !== '') {
        const price = Number(override);
        return { item, city, side, intent, price: Number.isFinite(price) && price > 0 ? price : null,
            setup: side === intent, mode: 'manual', date: null, status: Number.isFinite(price) && price > 0 ? 'ok' : 'invalid' };
    }
    const quote = quoteFromRow(cityRow(index, item, city), side, intent);
    const stamp = quote?.date ? Date.parse(quote.date) : NaN;
    const status = !quote ? 'missing' : !Number.isFinite(stamp) || stamp > now || now - stamp > PRICE_STALE_MS ? 'stale' : 'ok';
    return { ...quote, item, city, side, intent, mode: 'live', status, price: quote?.price ?? null };
}

export function priceIssue(quote) {
    return quote?.status === 'ok' ? null : `${quote?.item || 'Fiyat'} · ${quote?.city || ''}: ${quote?.status === 'stale' ? 'Eski / tarihsiz fiyat' : quote?.status === 'invalid' ? 'Geçersiz manuel fiyat' : 'Eksik fiyat'}`;
}
