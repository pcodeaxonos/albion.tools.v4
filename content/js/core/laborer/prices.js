import { quoteFromRow, PRICE_STALE_MS } from '../price-side.js';
import { cityRow } from '../market.js';

export const overrideKey = (server, item, city, side, intent) => JSON.stringify([server, item, city, side, intent]);

export function resolvePrice({ index, item, city, side, intent, override, now = Date.now() }) {
    if (override != null && override !== '') {
        const price = Number(override);
        return { item, city, side, intent, price: Number.isFinite(price) && price > 0 ? price : null,
            setup: side === intent, mode: 'manual', date: null, status: Number.isFinite(price) && price > 0 ? 'ok' : 'invalid' };
    }
    const row = cityRow(index, item, city);
    const field = side === 'buy' ? 'buy_price_max' : 'sell_price_min';
    const quote = quoteFromRow(row, side, intent);
    const stamp = quote?.date ? Date.parse(quote.date) : NaN;
    const status = !quote ? 'missing' : !Number.isFinite(stamp) || stamp > now || now - stamp > PRICE_STALE_MS ? 'stale' : 'ok';
    const reason = !row ? 'itemNotReturned' : !quote ? 'zeroPrice' : !Number.isFinite(stamp) ? 'missingTimestamp' : stamp > now ? 'futureTimestamp' : status === 'stale' ? 'staleTimestamp' : null;
    return { ...quote, item, city, side, intent, field, reason, setup: side === intent, mode: 'live', status, price: quote?.price ?? null };
}

export function priceIssue(quote) {
    const reasons = { itemNotReturned: 'API item kaydı dönmedi', zeroPrice: 'API fiyatı 0', missingTimestamp: 'Timestamp yok', futureTimestamp: 'Timestamp gelecekte', staleTimestamp: 'Eski fiyat' };
    return quote?.status === 'ok' ? null : `${quote?.item || 'Fiyat'} · ${quote?.city || ''}: ${quote?.intent === 'buy' ? 'Alış' : 'Satış'} fiyatı bulunamadı · ${reasons[quote?.reason] || (quote?.status === 'invalid' ? 'Geçersiz manuel fiyat' : 'Eksik / tarihsiz fiyat')}${quote?.field ? ` (${quote.field})` : ''}`;
}
