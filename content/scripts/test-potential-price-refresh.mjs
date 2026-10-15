import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DAY_MS, HISTORY_CACHE_POLICY } from '../js/core/market-history-config.mjs';
import { POTENTIAL_SNAPSHOT_KEY, readPotentialSnapshots, savePotentialSnapshots } from '../js/core/potential-price-snapshot.mjs';
import { tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';
import { SALE_ESTIMATOR, SALE_HORIZONS } from '../js/core/potential-sale-horizon.mjs';
const now = Date.now(), end = Math.floor(now / DAY_MS) * DAY_MS;
const request = { server: 'europe', city: 'Brecilien', itemId: 'T4_MOUNT_HORSE', quality: 1, side: 'sell' };
const points = last => Array.from({ length: 90 }, (_, i) => ({ timestamp: new Date(end - (i + last) * DAY_MS).toISOString(), avg_price: 30000 + i, item_count: 100 }));
let apiCalls = 0, failApi = false; const localDays = [], values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const context = vm.createContext({ console, Date, Map, Set });
const adapters = {
    './settings.js': { getServer: () => ({ id: 'europe' }) },
    './trade-live.js': { fetchCachedTradeSnapshot: async () => ({ trades: [] }) },
    './local-sales-history.js': { fetchLocalSalesHistory: async (ids, req, days) => { localDays.push(days); return new Map(ids.map(id => [id, { points: points(4) }])); } },
    './market-history.js': {
        fetchHistoryIndex: async (ids, cities, options) => { apiCalls++; if (failApi) throw Error('API unavailable'); assert.equal(options.days, 90); return new Map(ids.map(id => [id, { points: points(1) }])); },
        historyAt: (index, id) => index?.get(id)
    },
    './market.js': { fetchGamePrices: async () => [], indexPrices: () => new Map(), cityRow: () => null }
};
const filename = resolve('content/js/core/potential-price-refresh.js');
const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename });
await module.link(async specifier => {
    const exports = adapters[specifier] ?? await import(pathToFileURL(resolve('content/js/core', specifier)));
    const names = Object.keys(exports); return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, exports[name]); }, { context });
});
await module.evaluate();
const refresh = module.namespace.refreshPotentialPrices;
await refresh([request, request], { storage, days: 7 });
assert(apiCalls > 0, '90 old days must not suppress fresh API history');
assert(localDays.every(days => days === 90), 'sale duration must never truncate evidence horizon');
for (const { days } of SALE_HORIZONS) {
    const value = readPotentialSnapshots(storage, [request], days).get(tradeEvidenceKey(request));
    assert(value?.reliable, `${days}-day forecast recovers from fresh history`);
    assert.equal(value.estimator, SALE_ESTIMATOR);
}
const before = storage.getItem(POTENTIAL_SNAPSHOT_KEY);
failApi = true;
await assert.rejects(refresh([request], { storage, days: 7 }), /API unavailable/);
assert.equal(storage.getItem(POTENTIAL_SNAPSHOT_KEY), before, 'transport failure cannot overwrite saved decisions');
await assert.rejects(refresh([{ ...request, server: 'west' }], { storage }), /sunucusunu/);
const failed = new Map([[tradeEvidenceKey(request), { savedSnapshot: true, estimator: SALE_ESTIMATOR, days: 7, reliable: false, price: null }]]);
savePotentialSnapshots(storage, [request], 7, failed, now);
assert.equal(readPotentialSnapshots(storage, [request], 7, now + 1).size, 1, 'recent negative cache avoids request storms');
assert.equal(readPotentialSnapshots(storage, [request], 7, now + HISTORY_CACHE_POLICY.negativeMs + 1).size, 0, 'failed estimates are retried after bounded negative cache');
console.log('Potential refresh: stale dense history, 90-day scope, all horizons, failure preservation, server isolation and bounded negative cache passed.');
