import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const context = vm.createContext({ Date, Map, Set, URLSearchParams, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ server: 'europe', rows: [
        { server: 'europe', item_id: 'T4_MOUNT_HORSE', location: 'Martlock', quality: 1,
            data: [{ timestamp: '2026-10-11T00:00:00Z', avg_price: 100, item_count: 60, intervalHours: 6 }] },
        { server: 'europe', item_id: 'T4_MOUNT_HORSE', location: 'Martlock', quality: 1,
            data: [{ timestamp: '2026-10-11T01:00:00Z', avg_price: 200, item_count: 10, intervalHours: 1 }] },
        { server: 'west', item_id: 'T4_MOUNT_HORSE', location: 'Martlock', quality: 1, data: [{ wrong: true }] }
    ] }) }) });
const filename = resolve('content/js/core/local-sales-history.js');
const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), { context });
await module.link(async specifier => {
    const values = specifier === './settings.js' ? { localPriceHost: () => 'http://localhost:3001' }
        : await import(pathToFileURL(resolve('content/js/core', specifier)));
    const names = Object.keys(values);
    return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, values[name]); }, { context });
});
await module.evaluate();
const result = await module.namespace.fetchLocalSalesHistory(['T4_MOUNT_HORSE'], { server: 'europe', city: 'Martlock', quality: 1 }, 90, { packet: true });
assert.equal(result.get('T4_MOUNT_HORSE').points.length, 2, 'all matching packet timescales survive the source adapter');
console.log('Local sales history: packet timescales retained and mismatched server excluded.');
