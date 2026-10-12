export const TRADE_HUB_HOST = '127.0.0.1';
export const TRADE_HUB_PORT = 3003;
export const TRADE_HUB_URL = `http://${TRADE_HUB_HOST}:${TRADE_HUB_PORT}`;
// The SAT provider locates UserData-EUROPE/Trades.json; these are personal fills.
export const TRADE_ARCHIVE_CONTEXT = Object.freeze({ server: 'europe', scope: 'personal' });
