import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const listeners = new Set();
const timers = new Map();
let timerId = 0;
const context = vm.createContext({ window: {
    addEventListener: (_, handler) => listeners.add(handler),
    removeEventListener: (_, handler) => listeners.delete(handler),
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id)
} });
const module = new vm.SourceTextModule(readFileSync('content/js/core/price-live.js', 'utf8'), { context });
await module.link(() => new vm.SyntheticModule(['localPriceHost', 'getSettings'], function () {
    this.setExport('localPriceHost', () => 'http://localhost');
    this.setExport('getSettings', () => ({ priceSource: 'api' }));
}, { context }));
await module.evaluate();
const { bindLivePrices } = module.namespace;
const received = [];
const stopDefault = bindLivePrices({}, () => assert.fail('API source should skip default subscriber'));
const stop = bindLivePrices({}, (detail) => received.push(detail.at), { packetSourceOnly: false });
const stopOther = bindLivePrices({}, () => received.push('other'), { packetSourceOnly: false });
function emit(at) { for (const handler of listeners) handler({ detail: { at } }); }
function flush() {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach(fn => fn());
}
emit('first');
emit('latest');
assert.equal(timers.size, 2, 'subscribers have independent batching windows');
flush();
assert.deepEqual(received, ['latest', 'other'], 'burst emits the latest event once per subscriber');
emit('next');
flush();
const bursts = [];
const stopBursts = bindLivePrices({}, detail => bursts.push(detail), { packetSourceOnly: false });
function emitDetail(detail) { for (const handler of listeners) handler({ detail }); }
emitDetail({ at: 'sword', items: ['T4_MAIN_SWORD'], cities: ['Caerleon'] });
emitDetail({ at: 'axe', items: ['T4_MAIN_AXE'], cities: ['Black Market'] });
flush();
assert.deepEqual(Array.from(bursts[0].items), ['T4_MAIN_SWORD', 'T4_MAIN_AXE'], 'all changed items survive a burst');
assert.deepEqual(Array.from(bursts[0].cities), ['Caerleon', 'Black Market'], 'all changed cities survive a burst');
emitDetail({ at: 'broad', items: [], cities: [] });
emitDetail({ at: 'narrow', items: ['T4_MAIN_SWORD'], cities: ['Caerleon'] });
flush();
assert.equal(bursts[1].items.length, 0, 'unscoped item update stays unscoped');
assert.equal(bursts[1].cities.length, 0, 'unscoped city update stays unscoped');
emitDetail({ at: 'single', items: ['T4_MAIN_AXE'], cities: ['Black Market'] });
flush();
assert.deepEqual(Array.from(bursts[2].items), ['T4_MAIN_AXE'], 'batch scope resets after delivery');
stopBursts();
const beforeStop = received.length;
emit('pending');
stop();
stopOther();
stopDefault();
flush();
assert.equal(received.length, beforeStop, 'unsubscribe cancels pending work');
assert.equal(listeners.size, 0);
console.log('Live prices: source options, batching, independent subscriptions and cleanup passed.');
