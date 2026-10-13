const PRICE_METHOD_LABELS = Object.freeze({
    buy: 'BUY ORDER',
    sell: 'SELL ORDER',
    potential: 'POTENTIAL',
    'long-term': 'LONG-TERM',
    average: 'AVERAGE',
    fixed: 'FIXED'
});
const PRICE_DIRECTIONS = Object.freeze({ buy: 'BUY', sell: 'SELL' });

/** Price method and economic direction are separate, explicit source data. */
export function priceSourceLabel({ side, intent, reference } = {}) {
    if (reference?.source === 'current-buy-fallback') return PRICE_METHOD_LABELS.buy;
    const method = PRICE_METHOD_LABELS[side] ?? String(side ?? '').toUpperCase();
    if (!method) return '';
    if (side === 'buy' || side === 'sell') return method;
    return [method, PRICE_DIRECTIONS[intent]].filter(Boolean).join(' ');
}
