/**
 * Matches scripts/price-hub.mjs SILVER_SCALE.
 * Albion internal silver values are stored as silver * 10000.
 */
export const SILVER_SCALE = 10000;

export const DEBOUNCE_MS = 300;
export const READ_RETRY_DELAYS_MS = [100, 250, 500];

export const MAIL_KIND_BY_TEXT = Object.freeze({
    MARKETPLACE_BUYORDER_FINISHED_SUMMARY: 'mail_buy',
    MARKETPLACE_SELLORDER_FINISHED_SUMMARY: 'mail_sell',
    MARKETPLACE_BUYORDER_EXPIRED_SUMMARY: 'mail_buy_expired',
    MARKETPLACE_SELLORDER_EXPIRED_SUMMARY: 'mail_sell_expired',
    BLACKMARKET_SELLORDER_EXPIRED_SUMMARY: 'blackmarket_sell_expired'
});
