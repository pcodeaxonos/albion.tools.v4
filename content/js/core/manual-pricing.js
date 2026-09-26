import { placesOrder } from './market-fees.js';
import { parseSortNumber } from '../utils/table-sort.js';

export function parsePrice(raw) {
    if (raw == null) {
        return null;
    }
    const value = parseSortNumber(raw);
    return value != null && value >= 0 ? value : null;
}

export function isManualPrice(raw) {
    return parsePrice(raw) != null;
}

export function manualQuote(price, side, intent) {
    return {
        price,
        book: price,
        date: null,
        side,
        intent,
        tick: 0,
        setup: placesOrder(intent, side),
        manual: true
    };
}
