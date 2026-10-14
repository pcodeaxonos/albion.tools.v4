export const DATA_PREFIX = 'albiontools.v4.';
export const USER_DATA_ENDPOINT = '/api/v1/user-data';
export const USER_DATA_FILE = '.albion-tools.sqlite';
export const USER_DATA_BACKUP_DIRECTORY = '.albion-tools-backups';
export const USER_DATA_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
export const USER_DATA_BACKUP_RETENTION = 48;
export const USER_DATA_MAX_BYTES = 50 * 1024 * 1024;
export const LEGACY_DATA_KIND = 'albion.tools.local-data';
export const LEGACY_DATA_VERSION = 1;
export const LEGACY_DATA_FILE = '.albion-tools-data.json';
const TRANSIENT_KEYS = new Set([
    DATA_PREFIX + '_syncClock', DATA_PREFIX + 'dailyBonusRedirectAt',
    DATA_PREFIX + 'dailyBonusRecipeCache', DATA_PREFIX + 'dailyBonusPriceCache'
]);
const EXTRA_KEYS = new Set(['opp-layout', 'opp-filters', 'opp-evidence-outbox-v1']);

export function isPersistentKey(key) {
    return typeof key === 'string' && key.length <= 200
        && (key.startsWith(DATA_PREFIX) || EXTRA_KEYS.has(key))
        // Potential-price snapshots are planner input, not a browser cache.  They
        // must travel through the same SQLite-backed path as fixed prices and
        // plans so a refresh in one page is visible to the planner everywhere.
        && !TRANSIENT_KEYS.has(key);
}

export function tableStorageKey(table) { return DATA_PREFIX + table; }
