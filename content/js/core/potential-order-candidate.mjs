import { PRICE_STALE_MS } from './market-history-config.mjs';
import { normalizePriceDate, quotedBookPrice, BOOK_PRICE_FIELDS } from './market-primitives.mjs';

// A current order is a posting scenario, never proof of an executed trade.
export function includePotentialOrder(history, request, row, days, now = Date.now()) {
    if (row?.item_id !== request.itemId || row?.city !== request.city || Number(row?.quality) !== request.quality) return history;
    const field = BOOK_PRICE_FIELDS[request.side];
    const book = Number(row[field]), date = normalizePriceDate(row[field + '_date']), at = Date.parse(date);
    if (!(book > 0) || !Number.isFinite(book) || !Number.isFinite(at) || at > now || now - at > PRICE_STALE_MS) return history;
    const price = quotedBookPrice(book, request.side, request.side);
    if (history?.reliable && (request.side === 'buy' ? history.price <= price : history.price >= price)) return history;
    return { ...history, price, rawPrice: price, reliable: true, priceReliable: true, days, setup: true,
        source: 'Oyun emir defteri', method: request.side === 'buy' ? 'Güncel alış emri adayı' : 'Güncel satış emri adayı',
        evidenceType: 'Bekleyen emir; gerçekleşmiş işlem değil', marketMeaning: 'Emir defteri fiyatı işlem garantisi değildir.',
        historicalPrice: history?.price ?? null, historicalSource: history?.source ?? null,
        selectedAt: date, selectedQuantity: null, latest: date, samples: 0, transactions: null, quantity: null,
        intervalHours: null, reason: null, book, validUntil: new Date(at + PRICE_STALE_MS).toISOString() };
}
