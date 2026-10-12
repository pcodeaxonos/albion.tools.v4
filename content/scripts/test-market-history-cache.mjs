import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

let clock = Date.parse('2026-10-12T12:00:00Z'), calls = 0, fail = false;
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
class Storage { getItem() { return null; } setItem() {} removeItem() {} }
const context = vm.createContext({ console: { warn() {} }, Date: ClockDate, URL, URLSearchParams, AbortSignal: { timeout() {} },
    setTimeout: callback => { callback(); }, Storage, localStorage: new Storage(), window: { addEventListener() {}, dispatchEvent() {} },
    document: { addEventListener() {}, querySelector() { return null; } }, CustomEvent: class {}, location: { search: '', pathname: '/' },
    fetch: async url => {
        calls++;
        if (fail) throw new Error('offline');
        const parsed = new URL(url), quality = Number(parsed.searchParams.get('qualities'));
        const ids = decodeURIComponent(parsed.pathname.split('/').at(-1).replace('.json', '')).split(',');
        return { ok: true, json: async () => ids.filter(id => id !== 'EMPTY').flatMap(item_id =>
            parsed.searchParams.get('locations').split(',').map(location => ({ item_id, location, quality,
                data: [{ timestamp: '2026-10-11T00:00:00Z', avg_price: 100, item_count: 10 }] }))) };
    } });
const modules = new Map();
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const module = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, module); return module;
}
const module = load('content/js/core/market-history.js');
await module.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier))); await module.evaluate();
const { fetchHistoryIndex, historyAt } = module.namespace;
async function expectCalls(count, run) { const before = calls; await run(); assert.equal(calls - before, count); }
await expectCalls(1, async () => { await fetchHistoryIndex(['EMPTY'], ['Bridgewatch']); await fetchHistoryIndex(['EMPTY'], ['Bridgewatch']); });
clock += 5 * 60000 + 1;
await expectCalls(1, () => fetchHistoryIndex(['EMPTY'], ['Bridgewatch']));
await expectCalls(1, async () => {
    await fetchHistoryIndex(['ORDER'], ['Bridgewatch', 'Fort Sterling']);
    await fetchHistoryIndex(['ORDER'], ['Fort Sterling', 'Bridgewatch']);
});
await expectCalls(1, () => Promise.all([fetchHistoryIndex(['CONCURRENT'], ['Bridgewatch']), fetchHistoryIndex(['CONCURRENT'], ['Bridgewatch'])]));
await expectCalls(2, async () => {
    await fetchHistoryIndex(['QUALITY'], ['Bridgewatch'], { qualities: 1 });
    const second = await fetchHistoryIndex(['QUALITY'], ['Bridgewatch'], { qualities: 2 });
    assert.equal(historyAt(second, 'QUALITY', 'Bridgewatch', 1), null);
});
await expectCalls(2, async () => {
    await fetchHistoryIndex(['PERIOD'], ['Bridgewatch'], { days: 28 });
    await fetchHistoryIndex(['PERIOD'], ['Bridgewatch'], { days: 29 });
});
fail = true; await fetchHistoryIndex(['FAIL'], ['Bridgewatch']); fail = false;
await expectCalls(1, () => fetchHistoryIndex(['FAIL'], ['Bridgewatch']));
console.log('History cache: negative TTL, city order, identical in-flight requests, quality/period isolation and failed-request retry passed.');
