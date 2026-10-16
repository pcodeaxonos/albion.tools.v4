import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

// Hold HTTP responses to reproduce overlapping flushes without touching user data.
const originalFetch = globalThis.fetch;
const requests = [];
const key = 'albiontools.v4.settings';
let revision = 0, stored = null;
globalThis.fetch = async (_url, options = {}) => {
    if (!options.method) return { ok: true, json: async () => ({ entries: [] }) };
    const { changes } = JSON.parse(options.body);
    return new Promise(resolve => requests.push(() => {
        const change = changes[0];
        if (change.revision !== revision) {
            resolve({ ok: false, status: 409, json: async () => ({ error: 'revision conflict' }) });
            return;
        }
        stored = change.value;
        resolve({ ok: true, json: async () => ({ entries: [{ key, value: stored, revision: ++revision }] }) });
    }));
};

try {
    const client = await import('../js/core/durable-storage.mjs');
    await client.initDurableStorage('http://fixture');
    client.writeDurable(key, 'first');
    const first = client.flushDurableWrites();
    const second = client.flushDurableWrites();
    const third = client.flushDurableWrites();
    const completion = Promise.allSettled([first, second, third]);
    assert.equal(requests.length, 1);
    client.writeDurable(key, 'latest');
    requests.shift()();
    await setImmediate();
    const overlapping = requests.length;
    while (requests.length) {
        requests.shift()();
        await setImmediate();
    }
    const results = await completion;
    assert.equal(overlapping, 1, 'waiting flush callers must share the next write');
    assert.ok(results.every(result => result.status === 'fulfilled'), 'same-client flushes must not conflict');
    assert.equal(stored, 'latest');
    assert.equal(revision, 2, 'each changed value is sent once');
    assert.equal(client.readDurable(key), stored);
    assert.equal(client.persistenceStatus().pending, 0);
    console.log('PASS concurrent durable flushes serialize requests and preserve the latest edit');
} finally {
    globalThis.fetch = originalFetch;
}
